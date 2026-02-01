import { WebSocket, WebSocketServer } from 'ws';
import { db } from '@/lib/db';
import { servers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import type {
  AgentHelloPayload,
  HeartbeatPayload,
  RustHeartbeatPayload,
  ConnectedAgent,
  ServerTokenInfo,
  WebSocketMessage,
} from './types';
import {
  handleHeartbeat,
  handleDeployStatus,
  handleContainerStatus,
  handleTaskResult,
  handleTelemetryBatch,
  handleAlert,
  handleDisconnect,
} from './handlers';

/**
 * AgentHub manages WebSocket connections from all agents
 */
class AgentHub {
  private agents: Map<string, ConnectedAgent> = new Map();
  private wss: WebSocketServer | null = null;
  private pendingCommands: Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  /**
   * Initialize the WebSocket server
   */
  initialize(wss: WebSocketServer) {
    this.wss = wss;
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
    setInterval(() => this.cleanupStaleConnections(), 60000);
    console.log('[AgentHub] Initialized');
  }

  /**
   * Handle new WebSocket connection
   */
  private async handleConnection(ws: WebSocket, req: any) {
    try {
      const token = this.extractToken(req);
      if (!token) {
        ws.close(4001, 'Missing token');
        return;
      }

      const serverInfo = await this.verifyAgentToken(token);
      if (!serverInfo) {
        ws.close(4001, 'Invalid token');
        return;
      }

      console.log(`[AgentHub] New connection from server ${serverInfo.serverId}`);

      const helloTimeout = setTimeout(() => {
        ws.close(4002, 'Timeout waiting for hello');
      }, 30000);

      ws.once('message', async (data) => {
        clearTimeout(helloTimeout);
        await this.handleHello(ws, serverInfo, data);
      });

      ws.on('error', (error) => {
        console.error(`[AgentHub] WebSocket error for ${serverInfo.serverId}:`, error);
        this.removeAgent(serverInfo.serverId);
      });

      ws.on('close', () => {
        console.log(`[AgentHub] Connection closed for ${serverInfo.serverId}`);
        this.removeAgent(serverInfo.serverId);
      });
    } catch (error) {
      console.error('[AgentHub] Connection error:', error);
      ws.close(4000, 'Connection error');
    }
  }

  /**
   * Handle agent_hello message
   */
  private async handleHello(ws: WebSocket, serverInfo: ServerTokenInfo, data: any) {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());
      const isRustAgent = message.type === 'Register';

      if (message.type !== 'agent_hello' && !isRustAgent) {
        ws.close(4002, 'Expected agent_hello or Register');
        return;
      }

      const payload = isRustAgent
        ? this.convertRustHello(message.payload)
        : message.payload as AgentHelloPayload;

      const agent: ConnectedAgent = {
        ws,
        serverId: serverInfo.serverId,
        orgId: serverInfo.orgId,
        agentId: payload.agent_id,
        lastHeartbeat: new Date(),
        serverName: serverInfo.serverName,
      };

      this.agents.set(serverInfo.serverId, agent);
      await this.updateServerInfo(serverInfo.serverId, payload);

      if (isRustAgent) {
        this.sendWelcome(ws, payload.agent_id);
      } else {
        this.sendHelloAck(ws, serverInfo);
      }

      ws.on('message', (data) => this.handleMessage(agent, data));
      console.log(`[AgentHub] Agent registered: ${serverInfo.serverId} (${payload.agent_id})`);
    } catch (error) {
      console.error('[AgentHub] Error handling hello:', error);
      ws.close(4003, 'Invalid hello message');
    }
  }

  private convertRustHello(payload: any): AgentHelloPayload {
    return {
      agent_id: payload.agent_id,
      server_id: payload.server_id,
      version: payload.version,
      runtime: payload.runtime_type as 'docker' | 'kubernetes',
      runtime_version: 'unknown',
      os: { name: 'Linux', version: 'unknown', kernel: 'unknown' },
      arch: 'x86_64',
      resources: { cpu_cores: 0, cpu_model: 'unknown', memory_total_mb: 0, disk_total_gb: 0 },
      network: { hostname: payload.hostname, public_ip: null, private_ip: '127.0.0.1' },
      capabilities: payload.capabilities || [],
    };
  }

  private async updateServerInfo(serverId: string, payload: AgentHelloPayload) {
    await db.update(servers)
      .set({
        status: 'online',
        agentVersion: payload.version,
        runtime: payload.runtime,
        runtimeVersion: payload.runtime_version,
        hostname: payload.network.hostname,
        publicIp: payload.network.public_ip,
        privateIp: payload.network.private_ip,
        osName: payload.os.name,
        osVersion: payload.os.version,
        arch: payload.arch,
        cpuCores: payload.resources.cpu_cores,
        memoryMb: payload.resources.memory_total_mb,
        diskGb: payload.resources.disk_total_gb,
        lastHeartbeatAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(servers.id, serverId));
  }

  private sendWelcome(ws: WebSocket, agentId: string) {
    ws.send(JSON.stringify({
      type: 'Welcome',
      payload: {
        agent_id: agentId,
        session_id: crypto.randomUUID(),
        server_time: new Date().toISOString(),
        config_version: '1.0.0',
      },
    }));
  }

  private sendHelloAck(ws: WebSocket, serverInfo: ServerTokenInfo) {
    ws.send(JSON.stringify({
      id: crypto.randomUUID(),
      type: 'hello_ack',
      timestamp: new Date().toISOString(),
      payload: {
        server_id: serverInfo.serverId,
        accepted: true,
        server_name: serverInfo.serverName,
        org_id: serverInfo.orgId,
        config: {
          heartbeat_interval_seconds: 30,
          telemetry_batch_interval_seconds: 5,
          telemetry_buffer_max_mb: 50,
          log_level: 'info',
        },
        pending_deployments: [],
      },
    }));
  }

  /**
   * Handle messages from connected agent
   */
  private async handleMessage(agent: ConnectedAgent, data: any) {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());

      switch (message.type) {
        case 'heartbeat':
        case 'Heartbeat':
          await handleHeartbeat(agent, message.payload as HeartbeatPayload);
          break;
        case 'command_response':
          this.handleCommandResponse(message);
          break;
        case 'deploy_status':
          await handleDeployStatus(agent, message);
          break;
        case 'ContainerStatus':
          await handleContainerStatus(agent, message);
          break;
        case 'TaskResult':
          await handleTaskResult(agent, message);
          break;
        case 'Error':
          console.error(`[AgentHub] Error from ${agent.serverId}:`, message.payload);
          break;
        case 'telemetry_batch':
          await handleTelemetryBatch(agent, message);
          break;
        case 'alert':
          await handleAlert(agent, message);
          break;
        case 'Ack':
          break;
        default:
          console.log(`[AgentHub] Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('[AgentHub] Error handling message:', error);
    }
  }

  private handleCommandResponse(message: WebSocketMessage) {
    const payload = message.payload as { request_id: string; success: boolean; error?: unknown; data?: unknown };
    const pending = this.pendingCommands.get(payload.request_id);

    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingCommands.delete(payload.request_id);
      payload.success ? pending.resolve(payload.data) : pending.reject(new Error(JSON.stringify(payload.error)));
    }
  }

  private async removeAgent(serverId: string) {
    if (this.agents.has(serverId)) {
      this.agents.delete(serverId);
      await handleDisconnect(serverId);
    }
  }

  private async cleanupStaleConnections() {
    const staleThreshold = 90000;
    for (const [serverId, agent] of this.agents.entries()) {
      if (Date.now() - agent.lastHeartbeat.getTime() > staleThreshold) {
        console.log(`[AgentHub] Cleaning up stale connection: ${serverId}`);
        agent.ws.close(4004, 'Heartbeat timeout');
        await this.removeAgent(serverId);
      }
    }
  }

  private extractToken(req: any): string | null {
    const auth = req.headers['authorization'];
    if (auth?.startsWith('Bearer ')) return auth.slice(7);
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    return url.searchParams.get('token');
  }

  private async verifyAgentToken(token: string): Promise<ServerTokenInfo | null> {
    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const server = await db.query.servers.findFirst({
        where: eq(servers.agentTokenHash, tokenHash),
      });
      if (!server) return null;
      return { serverId: server.id, orgId: server.orgId, serverName: server.name };
    } catch (error) {
      console.error('[AgentHub] Token verification error:', error);
      return null;
    }
  }

  // ===========================================
  // Public API
  // ===========================================

  sendToAgent(serverId: string, message: WebSocketMessage): boolean {
    const agent = this.agents.get(serverId);
    if (!agent || agent.ws.readyState !== WebSocket.OPEN) return false;
    agent.ws.send(JSON.stringify(message));
    return true;
  }

  async sendCommand(serverId: string, type: string, payload: unknown, timeoutMs = 30000): Promise<unknown> {
    const requestId = crypto.randomUUID();
    const message: WebSocketMessage = {
      id: requestId,
      type,
      timestamp: new Date().toISOString(),
      payload: { request_id: requestId, ...payload as object },
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(requestId);
        reject(new Error('Command timeout'));
      }, timeoutMs);

      this.pendingCommands.set(requestId, { resolve, reject, timeout });
      if (!this.sendToAgent(serverId, message)) {
        clearTimeout(timeout);
        this.pendingCommands.delete(requestId);
        reject(new Error('Agent not connected'));
      }
    });
  }

  isAgentConnected(serverId: string): boolean {
    const agent = this.agents.get(serverId);
    return !!agent && agent.ws.readyState === WebSocket.OPEN;
  }

  getConnectedServerIds(): string[] {
    return Array.from(this.agents.keys());
  }

  getAgentInfo(serverId: string): { agentId: string; lastHeartbeat: Date } | null {
    const agent = this.agents.get(serverId);
    return agent ? { agentId: agent.agentId, lastHeartbeat: agent.lastHeartbeat } : null;
  }
}

export const agentHub = new AgentHub();
