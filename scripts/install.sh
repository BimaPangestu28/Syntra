#!/bin/bash
# Syntra Agent Installer
# Usage: curl -fsSL https://get.syntra.catalystlabs.id | sh
#    or: curl -fsSL https://get.syntra.catalystlabs.id | sh -s -- --token YOUR_TOKEN
#
# Environment variables:
#   SYNTRA_TOKEN      - Server connection token (optional, can be set later)
#   SYNTRA_API_URL    - API endpoint (default: https://api.syntra.catalystlabs.id)
#   SYNTRA_VERSION    - Specific version to install (default: latest)
#   SYNTRA_INSTALL_DIR - Installation directory (default: /usr/local/bin)

set -e

# Configuration
GITHUB_REPO="syntra-dev/syntra"
BINARY_NAME="syntra-agent"
DEFAULT_INSTALL_DIR="/usr/local/bin"
DEFAULT_API_URL="https://api.syntra.catalystlabs.id"
CONFIG_DIR="/etc/syntra"
DATA_DIR="/var/lib/syntra"
LOG_DIR="/var/log/syntra"
SERVICE_USER="syntra"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Parse arguments
SYNTRA_TOKEN="${SYNTRA_TOKEN:-}"
SYNTRA_API_URL="${SYNTRA_API_URL:-$DEFAULT_API_URL}"
SYNTRA_VERSION="${SYNTRA_VERSION:-latest}"
SYNTRA_INSTALL_DIR="${SYNTRA_INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
SKIP_SERVICE=false
UNINSTALL=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --token)
            SYNTRA_TOKEN="$2"
            shift 2
            ;;
        --token=*)
            SYNTRA_TOKEN="${1#*=}"
            shift
            ;;
        --api-url)
            SYNTRA_API_URL="$2"
            shift 2
            ;;
        --version)
            SYNTRA_VERSION="$2"
            shift 2
            ;;
        --install-dir)
            SYNTRA_INSTALL_DIR="$2"
            shift 2
            ;;
        --skip-service)
            SKIP_SERVICE=true
            shift
            ;;
        --uninstall)
            UNINSTALL=true
            shift
            ;;
        --help)
            echo "Syntra Agent Installer"
            echo ""
            echo "Usage: curl -fsSL https://get.syntra.catalystlabs.id | sh -s -- [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --token TOKEN      Server connection token"
            echo "  --api-url URL      API endpoint (default: https://api.syntra.catalystlabs.id)"
            echo "  --version VERSION  Specific version (default: latest)"
            echo "  --install-dir DIR  Installation directory (default: /usr/local/bin)"
            echo "  --skip-service     Don't install systemd service"
            echo "  --uninstall        Remove Syntra agent"
            echo "  --help             Show this help"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Helper functions
info() {
    echo -e "${BLUE}==>${NC} ${BOLD}$1${NC}"
}

success() {
    echo -e "${GREEN}==>${NC} ${BOLD}$1${NC}"
}

warn() {
    echo -e "${YELLOW}Warning:${NC} $1"
}

error() {
    echo -e "${RED}Error:${NC} $1" >&2
    exit 1
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        if command -v sudo &> /dev/null; then
            SUDO="sudo"
        else
            error "This script requires root privileges. Please run with sudo or as root."
        fi
    else
        SUDO=""
    fi
}

# Detect OS
detect_os() {
    OS="$(uname -s)"
    case "$OS" in
        Linux)
            OS="linux"
            ;;
        Darwin)
            OS="darwin"
            ;;
        *)
            error "Unsupported operating system: $OS"
            ;;
    esac
}

# Detect architecture
detect_arch() {
    ARCH="$(uname -m)"
    case "$ARCH" in
        x86_64|amd64)
            ARCH="x86_64"
            ;;
        aarch64|arm64)
            ARCH="aarch64"
            ;;
        armv7l)
            ARCH="armv7"
            ;;
        *)
            error "Unsupported architecture: $ARCH"
            ;;
    esac
}

# Detect init system
detect_init() {
    if [[ -d /run/systemd/system ]]; then
        INIT_SYSTEM="systemd"
    elif [[ -f /etc/init.d/cron && ! -h /etc/init.d/cron ]]; then
        INIT_SYSTEM="sysvinit"
    elif [[ "$OS" == "darwin" ]]; then
        INIT_SYSTEM="launchd"
    else
        INIT_SYSTEM="unknown"
    fi
}

# Get latest version from GitHub
get_latest_version() {
    if [[ "$SYNTRA_VERSION" == "latest" ]]; then
        info "Fetching latest version..."
        SYNTRA_VERSION=$(curl -fsSL "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/' | sed 's/^v//')
        if [[ -z "$SYNTRA_VERSION" ]]; then
            # Fallback to a default version if GitHub API fails
            SYNTRA_VERSION="0.1.0"
            warn "Could not fetch latest version, using $SYNTRA_VERSION"
        fi
    fi
    echo "  Version: $SYNTRA_VERSION"
}

# Download binary
download_binary() {
    local url="https://github.com/${GITHUB_REPO}/releases/download/v${SYNTRA_VERSION}/${BINARY_NAME}-${OS}-${ARCH}.tar.gz"
    local tmp_dir=$(mktemp -d)
    local archive="${tmp_dir}/${BINARY_NAME}.tar.gz"

    info "Downloading Syntra Agent..."
    echo "  URL: $url"

    if command -v curl &> /dev/null; then
        HTTP_CODE=$(curl -fsSL -w "%{http_code}" -o "$archive" "$url" 2>/dev/null || echo "000")
    elif command -v wget &> /dev/null; then
        wget -q -O "$archive" "$url" && HTTP_CODE="200" || HTTP_CODE="000"
    else
        error "Neither curl nor wget found. Please install one of them."
    fi

    # If download failed, try to build from source or use dev binary
    if [[ "$HTTP_CODE" != "200" ]] || [[ ! -f "$archive" ]]; then
        warn "Release binary not found. This might be a development version."
        warn "Please build from source or check https://github.com/${GITHUB_REPO}/releases"

        # For development, check if binary exists locally
        if [[ -f "./target/release/${BINARY_NAME}" ]]; then
            info "Found local development binary"
            $SUDO cp "./target/release/${BINARY_NAME}" "${SYNTRA_INSTALL_DIR}/${BINARY_NAME}"
            $SUDO chmod +x "${SYNTRA_INSTALL_DIR}/${BINARY_NAME}"
            rm -rf "$tmp_dir"
            return 0
        fi

        rm -rf "$tmp_dir"
        error "Could not download binary. Please check the version and try again."
    fi

    info "Extracting..."
    tar -xzf "$archive" -C "$tmp_dir"

    # Find the binary (might be in a subdirectory)
    local binary_path=$(find "$tmp_dir" -name "$BINARY_NAME" -type f | head -1)
    if [[ -z "$binary_path" ]]; then
        binary_path="${tmp_dir}/${BINARY_NAME}"
    fi

    if [[ ! -f "$binary_path" ]]; then
        rm -rf "$tmp_dir"
        error "Binary not found in archive"
    fi

    $SUDO mv "$binary_path" "${SYNTRA_INSTALL_DIR}/${BINARY_NAME}"
    $SUDO chmod +x "${SYNTRA_INSTALL_DIR}/${BINARY_NAME}"

    rm -rf "$tmp_dir"
}

# Create system user
create_user() {
    if ! id "$SERVICE_USER" &>/dev/null; then
        info "Creating system user: $SERVICE_USER"
        if [[ "$OS" == "linux" ]]; then
            $SUDO useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER" 2>/dev/null || true
        fi
    fi
}

# Create directories
create_directories() {
    info "Creating directories..."

    $SUDO mkdir -p "$CONFIG_DIR"
    $SUDO mkdir -p "$DATA_DIR"
    $SUDO mkdir -p "$LOG_DIR"

    if [[ "$OS" == "linux" ]]; then
        $SUDO chown -R "$SERVICE_USER:$SERVICE_USER" "$DATA_DIR" 2>/dev/null || true
        $SUDO chown -R "$SERVICE_USER:$SERVICE_USER" "$LOG_DIR" 2>/dev/null || true
    fi
}

# Create configuration file
create_config() {
    local config_file="${CONFIG_DIR}/agent.toml"

    if [[ -f "$config_file" ]]; then
        warn "Configuration file already exists: $config_file"
        warn "Skipping configuration creation. Edit manually if needed."
        return 0
    fi

    info "Creating configuration..."

    $SUDO tee "$config_file" > /dev/null << EOF
# Syntra Agent Configuration
# Generated by installer on $(date -u +"%Y-%m-%dT%H:%M:%SZ")

[agent]
# Unique identifier for this server (auto-generated if empty)
id = ""

# Server name displayed in dashboard
name = "$(hostname)"

# Labels for organizing servers
labels = {}

[api]
# Syntra API endpoint
url = "${SYNTRA_API_URL}"

# Connection token (get this from the dashboard)
token = "${SYNTRA_TOKEN}"

# WebSocket reconnection settings
reconnect_interval_secs = 5
max_reconnect_attempts = 0  # 0 = infinite

[docker]
# Docker socket path
socket = "/var/run/docker.sock"

# Enable Docker management
enabled = true

# Registry mirrors (optional)
# registry_mirrors = ["https://mirror.gcr.io"]

[metrics]
# Enable metrics collection
enabled = true

# Collection interval in seconds
interval_secs = 15

# Metrics to collect
collect_cpu = true
collect_memory = true
collect_disk = true
collect_network = true
collect_containers = true

[logging]
# Log level: trace, debug, info, warn, error
level = "info"

# Log file path (empty = stdout only)
file = "${LOG_DIR}/agent.log"

# Max log file size in MB before rotation
max_size_mb = 100

# Number of rotated files to keep
max_files = 5
EOF

    $SUDO chmod 600 "$config_file"

    if [[ "$OS" == "linux" ]] && id "$SERVICE_USER" &>/dev/null; then
        $SUDO chown "$SERVICE_USER:$SERVICE_USER" "$config_file"
    fi
}

# Install systemd service
install_systemd_service() {
    if [[ "$SKIP_SERVICE" == "true" ]]; then
        return 0
    fi

    info "Installing systemd service..."

    $SUDO tee /etc/systemd/system/syntra-agent.service > /dev/null << EOF
[Unit]
Description=Syntra Agent
Documentation=https://docs.syntra.catalystlabs.id
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
ExecStart=${SYNTRA_INSTALL_DIR}/${BINARY_NAME} start --config ${CONFIG_DIR}/agent.toml
Restart=always
RestartSec=5
StartLimitInterval=60
StartLimitBurst=3

# Security hardening
NoNewPrivileges=false
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=${DATA_DIR} ${LOG_DIR}

# Allow Docker socket access
SupplementaryGroups=docker

# Environment
Environment=RUST_LOG=info
Environment=RUST_BACKTRACE=1

[Install]
WantedBy=multi-user.target
EOF

    # Add user to docker group
    if getent group docker &>/dev/null; then
        $SUDO usermod -aG docker "$SERVICE_USER" 2>/dev/null || true
    fi

    $SUDO systemctl daemon-reload
    $SUDO systemctl enable syntra-agent.service
}

# Install launchd service (macOS)
install_launchd_service() {
    if [[ "$SKIP_SERVICE" == "true" ]]; then
        return 0
    fi

    info "Installing launchd service..."

    local plist_path="/Library/LaunchDaemons/dev.syntra.agent.plist"

    $SUDO tee "$plist_path" > /dev/null << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>dev.syntra.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>${SYNTRA_INSTALL_DIR}/${BINARY_NAME}</string>
        <string>start</string>
        <string>--config</string>
        <string>${CONFIG_DIR}/agent.toml</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${LOG_DIR}/agent.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/agent.error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>RUST_LOG</key>
        <string>info</string>
    </dict>
</dict>
</plist>
EOF

    $SUDO launchctl load "$plist_path"
}

# Uninstall
uninstall() {
    info "Uninstalling Syntra Agent..."

    # Stop and disable service
    if [[ "$INIT_SYSTEM" == "systemd" ]]; then
        $SUDO systemctl stop syntra-agent.service 2>/dev/null || true
        $SUDO systemctl disable syntra-agent.service 2>/dev/null || true
        $SUDO rm -f /etc/systemd/system/syntra-agent.service
        $SUDO systemctl daemon-reload
    elif [[ "$INIT_SYSTEM" == "launchd" ]]; then
        $SUDO launchctl unload /Library/LaunchDaemons/dev.syntra.agent.plist 2>/dev/null || true
        $SUDO rm -f /Library/LaunchDaemons/dev.syntra.agent.plist
    fi

    # Remove binary
    $SUDO rm -f "${SYNTRA_INSTALL_DIR}/${BINARY_NAME}"

    # Ask about config and data
    echo ""
    read -p "Remove configuration files? (${CONFIG_DIR}) [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        $SUDO rm -rf "$CONFIG_DIR"
    fi

    read -p "Remove data files? (${DATA_DIR}) [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        $SUDO rm -rf "$DATA_DIR"
    fi

    read -p "Remove log files? (${LOG_DIR}) [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        $SUDO rm -rf "$LOG_DIR"
    fi

    # Remove user
    if id "$SERVICE_USER" &>/dev/null; then
        read -p "Remove system user? ($SERVICE_USER) [y/N] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            $SUDO userdel "$SERVICE_USER" 2>/dev/null || true
        fi
    fi

    success "Syntra Agent has been uninstalled"
    exit 0
}

# Print completion message
print_success() {
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║${NC}          ${BOLD}Syntra Agent installed successfully!${NC}            ${GREEN}║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${CYAN}Binary:${NC}  ${SYNTRA_INSTALL_DIR}/${BINARY_NAME}"
    echo -e "  ${CYAN}Config:${NC}  ${CONFIG_DIR}/agent.toml"
    echo -e "  ${CYAN}Logs:${NC}    ${LOG_DIR}/agent.log"
    echo ""

    if [[ -z "$SYNTRA_TOKEN" ]]; then
        echo -e "  ${YELLOW}Next steps:${NC}"
        echo ""
        echo "  1. Get your server token from the Syntra dashboard:"
        echo -e "     ${BLUE}https://syntra.catalystlabs.id/servers${NC}"
        echo ""
        echo "  2. Add the token to your configuration:"
        echo -e "     ${BOLD}sudo nano ${CONFIG_DIR}/agent.toml${NC}"
        echo ""
        echo "  3. Start the agent:"
        if [[ "$INIT_SYSTEM" == "systemd" ]]; then
            echo -e "     ${BOLD}sudo systemctl start syntra-agent${NC}"
        elif [[ "$INIT_SYSTEM" == "launchd" ]]; then
            echo -e "     ${BOLD}sudo launchctl start dev.syntra.agent${NC}"
        else
            echo -e "     ${BOLD}${SYNTRA_INSTALL_DIR}/${BINARY_NAME} start --config ${CONFIG_DIR}/agent.toml${NC}"
        fi
    else
        echo -e "  ${GREEN}Token configured!${NC} Starting agent..."
        echo ""
        if [[ "$INIT_SYSTEM" == "systemd" ]]; then
            $SUDO systemctl start syntra-agent
            echo -e "  Check status: ${BOLD}sudo systemctl status syntra-agent${NC}"
        elif [[ "$INIT_SYSTEM" == "launchd" ]]; then
            $SUDO launchctl start dev.syntra.agent
            echo -e "  Check status: ${BOLD}sudo launchctl list | grep syntra${NC}"
        fi
    fi

    echo ""
    echo -e "  ${CYAN}Useful commands:${NC}"
    if [[ "$INIT_SYSTEM" == "systemd" ]]; then
        echo "    sudo systemctl status syntra-agent   # Check status"
        echo "    sudo systemctl restart syntra-agent  # Restart agent"
        echo "    sudo journalctl -u syntra-agent -f   # View logs"
    elif [[ "$INIT_SYSTEM" == "launchd" ]]; then
        echo "    sudo launchctl list | grep syntra    # Check status"
        echo "    tail -f ${LOG_DIR}/agent.log         # View logs"
    fi
    echo "    syntra-agent --help                  # CLI help"
    echo ""
    echo -e "  ${CYAN}Documentation:${NC} https://docs.syntra.catalystlabs.id"
    echo -e "  ${CYAN}Support:${NC}       https://github.com/${GITHUB_REPO}/issues"
    echo ""
}

# Main installation flow
main() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}              ${BOLD}Syntra Agent Installer${NC}                       ${CYAN}║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    check_root
    detect_os
    detect_arch
    detect_init

    echo -e "  ${CYAN}OS:${NC}           $OS"
    echo -e "  ${CYAN}Architecture:${NC} $ARCH"
    echo -e "  ${CYAN}Init system:${NC}  $INIT_SYSTEM"
    echo ""

    # Handle uninstall
    if [[ "$UNINSTALL" == "true" ]]; then
        uninstall
    fi

    # Check for existing installation
    if [[ -f "${SYNTRA_INSTALL_DIR}/${BINARY_NAME}" ]]; then
        local current_version=$("${SYNTRA_INSTALL_DIR}/${BINARY_NAME}" --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")
        warn "Syntra Agent is already installed (version: $current_version)"
        read -p "Do you want to upgrade/reinstall? [y/N] " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Installation cancelled."
            exit 0
        fi

        # Stop existing service
        if [[ "$INIT_SYSTEM" == "systemd" ]]; then
            $SUDO systemctl stop syntra-agent 2>/dev/null || true
        elif [[ "$INIT_SYSTEM" == "launchd" ]]; then
            $SUDO launchctl stop dev.syntra.agent 2>/dev/null || true
        fi
    fi

    get_latest_version
    download_binary

    if [[ "$OS" == "linux" ]]; then
        create_user
    fi

    create_directories
    create_config

    # Install service based on init system
    if [[ "$INIT_SYSTEM" == "systemd" ]]; then
        install_systemd_service
    elif [[ "$INIT_SYSTEM" == "launchd" ]]; then
        install_launchd_service
    else
        warn "Unknown init system. Skipping service installation."
        warn "You'll need to start the agent manually."
    fi

    print_success
}

# Run main
main
