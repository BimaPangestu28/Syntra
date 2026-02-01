# Syntra - Feature Backlog

Future enhancements and features to implement.

---

## AI Agent with Tools (Priority: High)

**Status:** Backlog
**Estimated Effort:** 2-3 weeks
**Dependencies:** Current AI chat implementation

### Problem
Current AI implementation is passive - it only reads data and responds with text. It cannot take actions or fetch real-time data during conversation.

### Proposed Solution
Implement an agentic AI system with tool use capabilities.

### Architecture Options

1. **Anthropic Tool Use (Recommended for simplicity)**
   - Native Claude tool calling
   - Single-agent, multi-tool

2. **LangGraph (For complex workflows)**
   - Multi-agent orchestration
   - State machine for complex reasoning

### Tools to Implement

| Tool | Description | Risk Level |
|------|-------------|------------|
| `get_logs(service_id, lines, filter)` | Fetch recent logs | Low |
| `get_metrics(service_id, metric, timerange)` | Real-time metrics query | Low |
| `get_deployment_status(deployment_id)` | Check deployment progress | Low |
| `list_errors(service_id, status)` | List error groups | Low |
| `check_health(service_id)` | Run health check | Low |
| `trigger_deploy(service_id)` | Deploy service | Medium |
| `scale_service(service_id, replicas)` | Scale up/down | Medium |
| `restart_service(service_id)` | Restart containers | Medium |
| `rollback(service_id, deployment_id)` | Rollback to previous | Medium |
| `update_env(service_id, key, value)` | Update env variable | High |
| `run_command(server_id, command)` | Execute on server | High |

### Example Conversation Flow

```
User: "Why is my API returning 500 errors?"

Agent thinks: "I should check recent errors and logs"
  → Tool: get_errors(service_id, status="open")
  → Result: "TypeError: Cannot read property 'user' of undefined (45x)"

Agent thinks: "Let me see the logs around this error"
  → Tool: get_logs(service_id, lines=50, filter="error")
  → Result: [log entries showing the error context]

Agent thinks: "This looks related to recent deployment, let me check"
  → Tool: get_deployment_status(latest)
  → Result: "Deployed 2h ago, commit: 'Add user endpoint'"

Agent responds: "The 500 errors are caused by a TypeError in the user
endpoint added 2 hours ago. The code is trying to access 'user' property
on an undefined object. Here's the fix: [code suggestion]

Would you like me to rollback to the previous deployment while you fix this?"

User: "Yes, rollback please"

Agent: "Rolling back..."
  → Tool: rollback(service_id, previous_deployment_id)
  → Result: "Rollback successful"

Agent: "Done! Rolled back to deployment xyz123. Error rate should decrease
within a few minutes. I'll monitor and let you know."
```

### Implementation Steps

1. **Phase 1: Read-only tools**
   - get_logs
   - get_metrics
   - get_deployment_status
   - list_errors
   - check_health

2. **Phase 2: Action tools (with confirmation)**
   - trigger_deploy
   - scale_service
   - restart_service
   - rollback

3. **Phase 3: Advanced tools (with strict permissions)**
   - update_env
   - run_command

### Security Considerations

- All action tools require explicit user confirmation
- High-risk tools (run_command) require admin role
- Audit log all AI-initiated actions
- Rate limiting on action tools
- Rollback capability for all changes

### References
- [Anthropic Tool Use](https://docs.anthropic.com/claude/docs/tool-use)
- [LangGraph](https://langchain-ai.github.io/langgraph/)

---

## Workflow Notification Nodes: Telegram & Slack (Priority: Medium)

**Status:** Backlog
**Dependencies:** Current workflow builder implementation

### Problem
The workflow builder currently has a generic `notify` action node, but it doesn't support specific notification channels like Telegram or Slack. Users need to send automated alerts to their team's preferred messaging platforms.

### Proposed Solution
Add dedicated `notify_telegram` and `notify_slack` action nodes to the workflow builder.

### New Action Nodes

| Node | Description | Config Fields |
|------|-------------|---------------|
| `notify_telegram` | Send message to Telegram chat/group | Bot token, Chat ID, message template, parse mode (HTML/Markdown) |
| `notify_slack` | Send message to Slack channel | Webhook URL or Bot token, Channel, message template, mention users/groups |

### Implementation Steps

1. **Add action types to workflow builder**
   - File: `src/components/workflows/workflow-builder.tsx`
   - Add `notify_telegram` and `notify_slack` to `actionTypes` array
   - Icons: `Send` (Telegram), `Hash` (Slack) from lucide-react

2. **Add node config UI**
   - Telegram: Bot token input, chat ID input, message template textarea, parse mode select
   - Slack: Webhook URL input (or Bot token + channel), message template textarea, mention config

3. **Update workflow node component**
   - File: `src/components/workflows/workflow-node.tsx`
   - Add icons and styling for the new node types

4. **Backend execution**
   - File: `src/lib/workflows/index.ts`
   - Add `executeTelegramNotification()` - call Telegram Bot API (`sendMessage`)
   - Add `executeSlackNotification()` - call Slack Incoming Webhook or `chat.postMessage`

5. **Message templating**
   - Support variables: `{{service_name}}`, `{{error_message}}`, `{{trigger_type}}`, `{{timestamp}}`
   - Render context from workflow trigger data

6. **Secrets management**
   - Bot tokens and webhook URLs stored encrypted via existing vault/secrets system
   - Reference secrets by name in node config (e.g., `secret:telegram_bot_token`)

### API References
- [Telegram Bot API - sendMessage](https://core.telegram.org/bots/api#sendmessage)
- [Slack Incoming Webhooks](https://api.slack.com/messaging/webhooks)
- [Slack chat.postMessage](https://api.slack.com/methods/chat.postMessage)

---

## Other Backlog Items

### ClickHouse Integration for Telemetry
- Store traces, logs, metrics at scale
- Query language for observability data
- Retention policies

### Kubernetes Agent Adapter
- kube-rs integration
- Pod deployment instead of Docker
- Service mesh support

### Multi-region Deployment
- Region-aware routing
- Cross-region failover
- Latency-based routing

### Billing & Usage Metering
- Stripe integration
- Usage tracking per service
- Resource-based pricing

### Blue-Green / Canary Deployments
- Traffic splitting
- Automated rollback on error spike
- A/B testing support

---

*Last updated: February 2026*
