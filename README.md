# Flowlyt - GitHub Actions Workflow Analyzer

![Flowlyt Logo](https://img.shields.io/badge/Flowlyt-Enterprise%20Workflow%20Analysis-blue?style=for-the-badge)

An enterprise-grade GitHub Actions workflow analysis tool that provides comprehensive security, performance, and best practice evaluations for CI/CD pipelines.

## 🚀 Features

- **🔒 Advanced SHA Pinning**: Intelligent recommendations with specific commit hashes for 100+ popular actions
- **🛡️ Security Analysis**: Advanced threat detection for hardcoded secrets, permission misconfigurations, and unsafe action usage
- **⚡ Performance Optimization**: Caching strategies, parallel execution opportunities, and resource utilization analysis
- **✅ Best Practices Compliance**: Industry standards evaluation including naming conventions and documentation
- **📦 Smart Dependency Management**: Action versioning strategies with automated update recommendations
- **📊 Enterprise PDF Reports**: Professional, detailed analysis reports with risk assessments and strategic recommendations
- **🔄 Automated Database Updates**: Self-maintaining action database with GitHub API integration

## ⭐ New: SHA Pinning Enhancement

### 🎯 **Intelligent SHA Recommendations**
Instead of generic advice, get **specific, actionable suggestions**:

```yaml
# Before: Generic suggestion
❌ Action not pinned to SHA
💡 Suggestion: Pin actions to specific versions

# After: Specific SHA recommendation  
🔒 SHA Pinning Recommendation
💡 Pin to SHA: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2

┌─────────────────────────────────────────────────────────┐
│ 📋 Recommended Action:                          v4.2.2 │
│                                                         │
│ actions/checkout@11bd71901bbe5b1630ceea73d27... [📋]   │
│                                                         │
│ → Copy and replace in your workflow file               │
└─────────────────────────────────────────────────────────┘
```

### 🎨 **Beautiful Interactive UI**
- **Copy-to-clipboard functionality** for instant implementation
- **Color-coded security levels** (Error/Warning/Info)
- **Professional presentation** with gradient backgrounds
- **Version upgrade detection** with clear recommendations

### 🔄 **Self-Maintaining Database**
```bash
# Verify current database against GitHub
npm run verify-actions

# Update specific action to latest version
npm run update-actions -- --action="actions/checkout"

# Automated weekly updates via GitHub Actions
# (Creates PRs automatically when updates are available)
```

## 📊 What You Get

### Comprehensive Analysis
- **Security Issues**: Identifies vulnerabilities and security misconfigurations
- **Performance Bottlenecks**: Suggests optimizations for faster workflow execution
- **Best Practice Violations**: Ensures compliance with industry standards
- **Risk Assessment**: Strategic recommendations with priority levels

### Enterprise PDF Reports
- **Executive Dashboard**: Key metrics and risk indicators
- **Detailed Analysis**: File-by-file breakdown with specific recommendations
- **Best Practices Guide**: Industry-leading security, performance, and maintenance guidelines
- **Action Plan**: Prioritized next steps with timeframes

## 🛠️ Technology Stack

- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS
- **PDF Generation**: jsPDF with custom enterprise styling
- **YAML Parsing**: js-yaml
- **Icons**: Lucide React
- **Deployment**: GitHub Pages

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/harekrishnarai/flowlyt-web.git
cd flowlyt-web
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open [http://localhost:5173](http://localhost:5173) in your browser

### Building for Production

```bash
npm run build
```

## 📝 Usage

### Analyze GitHub Repository
1. Enter a GitHub repository URL
2. Select specific workflow files or analyze all
3. Generate comprehensive analysis reports

### Upload Workflow Files
1. Upload `.yml` or `.yaml` workflow files directly
2. Get instant analysis results
3. Download professional PDF reports

## 🔍 Analysis Categories

### Security Analysis
- Hardcoded secrets detection
- Permission misconfigurations
- Unsafe action usage
- Supply chain vulnerabilities

### Performance Analysis
- Caching strategy evaluation
- Parallel execution opportunities
- Resource utilization optimization
- Dependency management

### Best Practices
- Naming conventions
- Documentation standards
- Error handling protocols
- Maintainability guidelines

### Structural Integrity
- Workflow architecture assessment
- Job dependencies validation
- Conditional logic evaluation
- Error propagation patterns

## 📈 Enterprise Features

- **Dynamic PDF Generation**: Professional reports with custom branding
- **Risk Scoring**: Quantitative risk assessment (0-100 scale)
- **Strategic Recommendations**: Priority-based action items
- **Compliance Tracking**: Industry standards adherence
- **Best Practices Library**: Comprehensive guidelines for secure CI/CD

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙋‍♂️ Author

**Harekrishna Rai**
- GitHub: [@harekrishnarai](https://github.com/harekrishnarai)
- Website: [harekrishnarai.me](https://harekrishnarai.me)

## 🌟 Show Your Support

Give a ⭐️ if this project helped you improve your GitHub Actions workflows!

---

**Flowlyt** - Making CI/CD pipelines more secure, performant, and maintainable.
