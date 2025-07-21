# 🗜️ AI Chat Compressor

A Firefox browser extension that intelligently compresses Claude AI conversations while preserving all essential information.

![image](https://github.com/user-attachments/assets/78954be6-c324-4919-8cb2-5597e03c515e)

## ✨ Why This Exists

Claude conversations can quickly become massive - often 50k+ tokens that exceed context limits and become expensive to process. This extension solves that by:

- **Reducing token costs** by ~50% (configurable 20-80% compression)
- **Preserving context** for follow-up conversations  
- **Maintaining readability** with intelligent distillation
- **Enabling sharing** of compressed conversation summaries

## 🚀 Features

- **Smart Compression**: Reduces conversation length by ~50% while keeping all key decisions and context
- **Parallel Processing**: Processes multiple chunks simultaneously for faster compression
- **Configurable Chunking**: Adjustable input chunk size (default: 5,000 tokens → 2,000 tokens)
- **Progress Tracking**: Real-time feedback with completion status
- **Export Options**: Download as formatted Markdown files
- **Cancellation Support**: Stop operations mid-process

## 🔧 How It Works

1. **Chunking**: Splits large conversations into manageable pieces (default: 5k tokens)
2. **Parallel Compression**: Sends all chunks to GPT-4.1 simultaneously 
3. **Intelligent Distillation**: Uses advanced prompts to preserve essential information
4. **Reassembly**: Combines compressed chunks into a coherent summary
5. **Export**: Downloads formatted Markdown with compression statistics

### Compression Example
```
📊 Compression Results
📝 Original: 25,000 tokens
⚡ Compressed: 12,500 tokens  
💾 Tokens Saved: 12,500
🎯 Reduction: 50%
⚙️ Method: chunked-gpt-4.1-5chunks
```

## 📦 Installation

### Prerequisites
- Firefox browser
- OpenAI API key

### Setup
1. Clone this repository
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Select the `manifest.json` file
5. Navigate to any Claude conversation page
6. Click the extension icon and add your OpenAI API key

## 🎯 Usage

1. **Open a Claude conversation** in your browser
2. **Click the extension icon** in your toolbar
3. **Add your API key** in settings (one-time setup)
4. **Adjust chunk size** if needed (default: 5,000 tokens)
5. **Click "Compress Conversation"** 
6. **Watch real-time progress** as chunks process in parallel
7. **Download the compressed markdown** when complete

### Settings
- **Chunk Size**: Input size for each compression chunk (1k-50k tokens)
- **Reset Button**: Quickly return to 5k default
- **API Key Management**: Secure local storage with easy removal

## 🌐 Browser Support

- ✅ **Firefox**: Full support
- ❌ **Chrome/Chromium**: Not yet supported

> **Want Chrome support?** Please [open an issue](../../issues) to request Chromium-based browser compatibility.

## 🛠️ Development

### Tech Stack
- **Frontend**: HTML, CSS, JavaScript
- **API**: OpenAI GPT-4.1
- **Architecture**: Browser extension (Manifest V2)
- **Storage**: Browser local storage

### File Structure
```
├── manifest.json       # Extension configuration
├── popup.html          # Extension UI
├── popup.js            # UI logic and API calls  
├── background.js       # Background processing
├── content.js          # Claude page interaction
└── README.md           # This file
```

## 📊 Performance

- **Compression Speed**: ~30 seconds for 25k token conversation (parallel processing)
- **Typical Ratio**: 40-60% reduction (configurable)
- **API Efficiency**: Parallel chunk processing maximizes throughput
- **Quality**: Preserves all key decisions, context, and technical details

## 🤝 Contributing

Contributions welcome! Please feel free to submit pull requests or open issues for:
- Chromium browser support
- Additional compression models
- UI/UX improvements
- Performance optimizations

## 📄 License

This project is open source. See the repository for licensing details.

---

**💡 Tip**: Start with smaller chunk sizes (2k-5k tokens) for more reliable compression, or larger chunks (10k+ tokens) for faster processing. 
