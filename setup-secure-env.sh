#!/bin/bash
# 🔐 Secure Environment Setup Script
# This creates a secure environment file outside your project directory

echo "🔐 Setting up secure API key environment..."

# Create secure directory outside project
SECURE_DIR="$HOME/.config/qwencode-secure"
ENV_FILE="$SECURE_DIR/api-keys.env"

mkdir -p "$SECURE_DIR"
chmod 700 "$SECURE_DIR"  # Only you can access

# Create template if it doesn't exist
if [ ! -f "$ENV_FILE" ]; then
    cat > "$ENV_FILE" << 'EOF'
# 🔑 Secure API Keys for QwenCode Testing
# This file is stored outside your project directory
# Location: ~/.config/qwencode-secure/api-keys.env

# OpenRouter (Universal Gateway)
export OPENROUTER_API_KEY="sk-or-YOUR_KEY_HERE"

# OpenAI Direct  
export OPENAI_API_KEY="sk-YOUR_KEY_HERE"

# Google Gemini
export GEMINI_API_KEY="YOUR_GEMINI_KEY_HERE"

# Anthropic Claude
export ANTHROPIC_API_KEY="sk-ant-YOUR_CLAUDE_KEY_HERE"

# Qwen Direct API
export QWEN_API_KEY="sk-YOUR_QWEN_KEY_HERE"

# Local models (no keys needed)
export OLLAMA_HOST="http://localhost:11434"
export LM_STUDIO_HOST="http://localhost:1234"
EOF

    echo "✅ Created secure environment template at: $ENV_FILE"
    echo ""
    echo "📝 NEXT STEPS:"
    echo "1. Edit the file with your actual API keys:"
    echo "   nano $ENV_FILE"
    echo ""
    echo "2. Load the environment before testing:"
    echo "   source $ENV_FILE"
    echo "   npm run test:providers"
    echo ""
    echo "3. Or use the secure test command:"
    echo "   npm run test:providers:secure"
else
    echo "✅ Secure environment file already exists at: $ENV_FILE"
fi

# Secure the file
chmod 600 "$ENV_FILE"  # Only you can read/write

echo ""
echo "🔒 Security Status:"
echo "   • File location: OUTSIDE project directory ✅"
echo "   • File permissions: 600 (owner only) ✅"  
echo "   • Never committed to git ✅"
echo "   • Separate from project files ✅"
echo ""
echo "💡 To use: source $ENV_FILE && npm run test:providers"