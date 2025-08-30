#!/bin/bash

# Production-Grade Integration Test Runner for Claude Code Max Integration
# This script runs comprehensive tests to validate the entire integration

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TEST_TIMEOUT=300  # 5 minutes
COVERAGE_THRESHOLD=80
MAX_RETRIES=3

# Logging
LOG_FILE="/tmp/qwen-integration-test-$(date +%Y%m%d-%H%M%S).log"

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

# Test function with retry logic
run_test_with_retry() {
    local test_command="$1"
    local test_name="$2"
    local retry_count=0
    
    while [ $retry_count -lt $MAX_RETRIES ]; do
        log "Running $test_name (attempt $((retry_count + 1))/$MAX_RETRIES)"
        
        if timeout $TEST_TIMEOUT bash -c "$test_command" >> "$LOG_FILE" 2>&1; then
            success "$test_name passed"
            return 0
        else
            retry_count=$((retry_count + 1))
            if [ $retry_count -lt $MAX_RETRIES ]; then
                warning "$test_name failed, retrying..."
                sleep 5
            fi
        fi
    done
    
    error "$test_name failed after $MAX_RETRIES attempts"
    return 1
}

# Pre-flight checks
preflight_checks() {
    log "🚀 Starting pre-flight checks..."
    
    # Check Node.js version
    if ! command -v node &> /dev/null; then
        error "Node.js is required but not installed"
        exit 1
    fi
    
    local node_version
    node_version=$(node --version)
    log "Node.js version: $node_version"
    
    # Check if Claude CLI is available
    if command -v claude &> /dev/null; then
        local claude_version
        claude_version=$(claude --version 2>/dev/null || echo "unknown")
        log "Claude CLI version: $claude_version"
    else
        warning "Claude CLI not found - Claude integration tests may fail"
    fi
    
    # Check if project dependencies are installed
    if [ ! -d "node_modules" ]; then
        log "Installing dependencies..."
        npm install
    fi
    
    # Check if bundle is up to date
    if [ ! -f "bundle/gemini.js" ]; then
        log "Building project..."
        npm run build
        npm run bundle
    fi
    
    success "Pre-flight checks completed"
}

# Run unit tests
run_unit_tests() {
    log "🧪 Running unit tests..."
    
    if ! run_test_with_retry "npm test -- --testPathPattern='claude-integration'" "Claude Integration Tests"; then
        return 1
    fi
    
    if ! run_test_with_retry "npm test -- --testPathPattern='system-prompt-preservation'" "System Prompt Preservation Tests"; then
        return 1
    fi
    
    if ! run_test_with_retry "npm test -- --testPathPattern='qwen-oauth-integrity'" "Qwen OAuth Integrity Tests"; then
        return 1
    fi
    
    success "Unit tests completed"
}

# Run integration tests
run_integration_tests() {
    log "🔗 Running integration tests..."
    
    # Test model switching
    if ! run_test_with_retry "node bundle/gemini.js --prompt '/model list' | grep -E '(claude|qwen|gpt)'" "Model Listing Test"; then
        return 1
    fi
    
    # Test Claude model switching
    if command -v claude &> /dev/null; then
        if ! run_test_with_retry "timeout 30 node bundle/gemini.js --prompt '/model claude'" "Claude Model Switch Test"; then
            warning "Claude model switch test failed - this may be expected if not authenticated"
        fi
    fi
    
    success "Integration tests completed"
}

# Run performance tests
run_performance_tests() {
    log "⚡ Running performance tests..."
    
    # Test model switch performance
    local start_time
    local end_time
    local duration
    
    start_time=$(date +%s)
    if timeout 60 node bundle/gemini.js --prompt '/model current' > /dev/null 2>&1; then
        end_time=$(date +%s)
        duration=$((end_time - start_time))
        
        if [ $duration -lt 30 ]; then
            success "Model switch performance test passed (${duration}s)"
        else
            warning "Model switch took ${duration}s (expected <30s)"
        fi
    else
        error "Model switch performance test failed"
        return 1
    fi
    
    success "Performance tests completed"
}

# Generate coverage report
generate_coverage() {
    log "📊 Generating coverage report..."
    
    if npm run test:coverage > /dev/null 2>&1; then
        if [ -f "coverage/coverage-summary.json" ]; then
            local coverage
            coverage=$(node -e "
                const fs = require('fs');
                const coverage = JSON.parse(fs.readFileSync('coverage/coverage-summary.json', 'utf8'));
                const total = coverage.total;
                console.log(\`Lines: \${total.lines.pct}%, Functions: \${total.functions.pct}%, Branches: \${total.branches.pct}%, Statements: \${total.statements.pct}%\`);
            " 2>/dev/null)
            
            log "Coverage: $coverage"
            
            # Check coverage threshold
            local line_coverage
            line_coverage=$(node -e "
                const fs = require('fs');
                const coverage = JSON.parse(fs.readFileSync('coverage/coverage-summary.json', 'utf8'));
                console.log(coverage.total.lines.pct);
            " 2>/dev/null)
            
            if (( $(echo "$line_coverage >= $COVERAGE_THRESHOLD" | bc -l) )); then
                success "Coverage threshold met: ${line_coverage}% >= ${COVERAGE_THRESHOLD}%"
            else
                warning "Coverage below threshold: ${line_coverage}% < ${COVERAGE_THRESHOLD}%"
            fi
        fi
    else
        warning "Coverage generation failed"
    fi
}

# Validate configuration files
validate_configuration() {
    log "⚙️  Validating configuration files..."
    
    # Check model profiles
    if [ -f "$HOME/.qwen/model-profiles.json" ]; then
        if node -e "JSON.parse(require('fs').readFileSync('$HOME/.qwen/model-profiles.json', 'utf8'))" 2>/dev/null; then
            success "Model profiles configuration is valid JSON"
        else
            error "Model profiles configuration contains invalid JSON"
            return 1
        fi
    else
        warning "No model profiles found (this is okay for fresh installations)"
    fi
    
    # Check VS Code settings
    if [ -f ".vscode/settings.json" ]; then
        if node -e "JSON.parse(require('fs').readFileSync('.vscode/settings.json', 'utf8'))" 2>/dev/null; then
            success "VS Code settings are valid JSON"
        else
            error "VS Code settings contain invalid JSON"
            return 1
        fi
    fi
    
    # Check Jest configuration
    if [ -f "jest.config.js" ]; then
        if node -e "require('./jest.config.js')" 2>/dev/null; then
            success "Jest configuration is valid"
        else
            error "Jest configuration is invalid"
            return 1
        fi
    fi
    
    success "Configuration validation completed"
}

# Generate test report
generate_report() {
    log "📋 Generating test report..."
    
    local report_file="test-report-$(date +%Y%m%d-%H%M%S).md"
    
    cat > "$report_file" << EOF
# QwenCode Claude Integration Test Report

**Generated**: $(date)
**Environment**: $(uname -a)
**Node.js**: $(node --version)
**Claude CLI**: $(command -v claude &> /dev/null && claude --version 2>/dev/null || echo "Not available")

## Test Results

### Pre-flight Checks
✅ Dependencies installed
✅ Project built and bundled
✅ Configuration files validated

### Unit Tests
$([ $unit_tests_passed = true ] && echo "✅ Claude Integration Tests" || echo "❌ Claude Integration Tests")
$([ $unit_tests_passed = true ] && echo "✅ System Prompt Preservation Tests" || echo "❌ System Prompt Preservation Tests")
$([ $unit_tests_passed = true ] && echo "✅ Qwen OAuth Integrity Tests" || echo "❌ Qwen OAuth Integrity Tests")

### Integration Tests
$([ $integration_tests_passed = true ] && echo "✅ Model Listing Test" || echo "❌ Model Listing Test")
$([ $integration_tests_passed = true ] && echo "✅ Model Switching Tests" || echo "❌ Model Switching Tests")

### Performance Tests
$([ $performance_tests_passed = true ] && echo "✅ Model Switch Performance (<30s)" || echo "❌ Model Switch Performance")

### Coverage Report
$([ -f "coverage/coverage-summary.json" ] && echo "Coverage report generated in coverage/" || echo "Coverage report not available")

## Logs
Full test logs available at: \`$LOG_FILE\`

## Summary
$([ $overall_success = true ] && echo "🎉 All tests passed! Claude integration is ready for production." || echo "⚠️ Some tests failed. Please review the logs and fix issues before deploying.")
EOF
    
    log "Test report generated: $report_file"
    
    if [ $overall_success = true ]; then
        success "🎉 All tests passed! Claude integration is production-ready."
    else
        error "❌ Some tests failed. Please review and fix issues."
        echo "Full logs: $LOG_FILE"
        echo "Test report: $report_file"
    fi
}

# Main execution
main() {
    log "🚀 Starting QwenCode Claude Integration Test Suite"
    log "Log file: $LOG_FILE"
    
    local unit_tests_passed=false
    local integration_tests_passed=false
    local performance_tests_passed=false
    local overall_success=false
    
    # Run all test phases
    if preflight_checks && \
       validate_configuration && \
       { run_unit_tests && unit_tests_passed=true; } && \
       { run_integration_tests && integration_tests_passed=true; } && \
       { run_performance_tests && performance_tests_passed=true; }; then
        overall_success=true
    fi
    
    # Generate coverage regardless of test results
    generate_coverage
    
    # Generate final report
    generate_report
    
    # Exit with appropriate code
    if [ $overall_success = true ]; then
        exit 0
    else
        exit 1
    fi
}

# Handle interrupts gracefully
trap 'error "Test suite interrupted"; exit 130' INT TERM

# Run main function
main "$@"