// Background script to handle API requests and background processing
let compressionState = {
  isRunning: false,
  currentStep: 0,
  totalSteps: 0,
  progress: 0,
  message: '',
  type: null, // 'extract' or 'compress'
  data: null,
  error: null,
  compression: {
    originalTokens: 0,
    compressedTokens: 0,
    ratio: 0
  }
};

// Clear any existing state on startup
browser.runtime.onStartup.addListener(() => {
  browser.storage.local.remove(['compressionState']);
});

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'testClaudeAPI') {
    testClaudeAPI(request.apiKey)
      .then(response => sendResponse({ success: true, data: response }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    
    return true;
  } else if (request.action === 'compressMessage') {
    compressMessage(request.apiKey, request.currentMessage, request.compressedContext, request.messageRole)
      .then(response => sendResponse({ success: true, data: response }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    
    return true;
  } else if (request.action === 'startBackgroundOperation') {
    startBackgroundOperation(request.type, request.data, request.apiKey, request.debugMode)
      .then(response => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    
    return true;
  } else if (request.action === 'getCompressionState') {
    sendResponse({ state: compressionState });
    return true;
  } else if (request.action === 'clearCompressionState') {
    compressionState = {
      isRunning: false,
      currentStep: 0,
      totalSteps: 0,
      progress: 0,
      message: '',
      type: null,
      data: null,
      error: null,
      compression: {
        originalTokens: 0,
        compressedTokens: 0,
        ratio: 0
      }
    };
    browser.storage.local.remove(['compressionState']);
    sendResponse({ success: true });
    return true;
  } else if (request.action === 'cancelOperation') {
    if (compressionState.isRunning) {
      compressionState.isRunning = false;
      compressionState.error = 'Operation cancelled by user';
      compressionState.compression = {
        originalTokens: 0,
        compressedTokens: 0,
        ratio: 0
      };
      saveCompressionState();
    }
    sendResponse({ success: true });
    return true;
  }
});

async function startBackgroundOperation(type, conversationData, apiKey, debugMode = false) {
  try {
    if (compressionState.isRunning) {
      throw new Error('Operation already in progress');
    }

    const messageCount = conversationData.messages ? conversationData.messages.length : 0;
    const debugSuffix = debugMode && messageCount > 10 ? ` (Debug: ${messageCount} → 10 messages)` : '';

    compressionState = {
      isRunning: true,
      currentStep: 0,
      totalSteps: type === 'compress' ? conversationData.messages.length : 4,
      progress: 0,
      message: `Starting ${type} operation${debugSuffix}...`,
      type: type,
      data: null,
      error: null,
      compression: {
        originalTokens: 0,
        compressedTokens: 0,
        ratio: 0
      }
    };

    await saveCompressionState();

    if (type === 'extract') {
      await handleExtractOperation(conversationData, debugMode);
    } else if (type === 'compress') {
      await handleCompressOperation(conversationData, apiKey, debugMode);
    }

  } catch (error) {
    compressionState.error = error.message;
    compressionState.isRunning = false;
    await saveCompressionState();
    throw error;
  }
}

async function handleExtractOperation(conversationData, debugMode = false) {
  try {
    const messageCount = conversationData.messages ? conversationData.messages.length : 0;
    const debugSuffix = debugMode ? ` (Debug: ${messageCount} messages)` : '';
    
    updateProgress(25, `Processing messages${debugSuffix}...`);
    await sleep(500);
    
    // Check if operation was cancelled
    if (!compressionState.isRunning) {
      throw new Error('Operation cancelled by user');
    }
    
    updateProgress(50, 'Converting to markdown...');
    const markdown = convertToMarkdown(conversationData);
    await sleep(500);
    
    // Check if operation was cancelled
    if (!compressionState.isRunning) {
      throw new Error('Operation cancelled by user');
    }
    
    updateProgress(75, 'Preparing download...');
    await sleep(500);
    
    // Check if operation was cancelled
    if (!compressionState.isRunning) {
      throw new Error('Operation cancelled by user');
    }
    
    updateProgress(100, 'Complete!');
    
    compressionState.data = {
      conversationData: conversationData,
      markdown: markdown,
      type: 'markdown'
    };
    compressionState.isRunning = false;
    await saveCompressionState();
    
  } catch (error) {
    compressionState.error = error.message;
    compressionState.isRunning = false;
    await saveCompressionState();
    throw error;
  }
}

async function handleCompressOperation(conversationData, apiKey, debugMode = false) {
  try {
    const messages = conversationData.messages;
    let compressedContext = '';
    const compressedMessages = [];
    
    const debugSuffix = debugMode ? ' (Debug mode)' : '';
    
    // Calculate original token count
    const originalText = messages.map(m => m.content).join('\n\n');
    const originalTokens = estimateTokenCount(originalText);
    compressionState.compression.originalTokens = originalTokens;
    
    let runningCompressedTokens = 0;
    
          for (let i = 0; i < messages.length; i++) {
        // Check if operation was cancelled
        if (!compressionState.isRunning) {
          throw new Error('Operation cancelled by user');
        }
        
        const message = messages[i];
        const progressPercent = (i / messages.length) * 80; // 0-80% for compression
        
        // Calculate compression ratio so far
        const currentRatio = runningCompressedTokens > 0 ? 
          ((originalTokens - runningCompressedTokens) / originalTokens * 100).toFixed(1) : 0;
        
        let progressMessage = `Compressing message ${i + 1}/${messages.length}${debugSuffix}...`;
        if (runningCompressedTokens > 0) {
          progressMessage += `\n📊 ${originalTokens.toLocaleString()}→${runningCompressedTokens.toLocaleString()} tokens (${currentRatio}% reduction)`;
        }
        
        updateProgress(progressPercent, progressMessage);
        
        // Compress the message
        const compressedContent = await compressMessage(apiKey, message.content, compressedContext, message.role);
        
        const compressedMessage = {
          role: message.role,
          content: compressedContent
        };
        compressedMessages.push(compressedMessage);
        
        // Update token tracking
        runningCompressedTokens += estimateTokenCount(compressedContent);
        compressionState.compression.compressedTokens = runningCompressedTokens;
        compressionState.compression.ratio = ((originalTokens - runningCompressedTokens) / originalTokens * 100);
        
        // Update compressed context for next message
        const roleLabel = message.role === 'user' ? '👤 **User**' : '🤖 **Claude**';
        compressedContext += `${roleLabel}: ${compressedContent}\n\n`;
        
        compressionState.currentStep = i + 1;
        await saveCompressionState();
      }
    
          updateProgress(85, 'Generating compressed markdown...');
      
      // Final compression stats
      const finalRatio = ((originalTokens - runningCompressedTokens) / originalTokens * 100).toFixed(1);
      const tokenReduction = originalTokens - runningCompressedTokens;
      
      // Create compressed conversation data
      const compressedData = {
        ...conversationData,
        messages: compressedMessages,
        originalMessageCount: messages.length,
        compressionDate: new Date().toISOString(),
        compressionStats: {
          originalTokens: originalTokens,
          compressedTokens: runningCompressedTokens,
          tokensReduced: tokenReduction,
          compressionRatio: finalRatio
        }
      };
      
      const compressedMarkdown = convertToCompressedMarkdown(compressedData);
      
      updateProgress(100, `✅ Compression Complete!\n🎯 ${originalTokens.toLocaleString()}→${runningCompressedTokens.toLocaleString()} tokens (${finalRatio}% reduction)`);
      
      compressionState.data = {
        conversationData: compressedData,
        markdown: compressedMarkdown,
        type: 'compressed',
        originalMessageCount: messages.length,
        compressionStats: compressedData.compressionStats
      };
      compressionState.isRunning = false;
      await saveCompressionState();
    
  } catch (error) {
    compressionState.error = error.message;
    compressionState.isRunning = false;
    await saveCompressionState();
    throw error;
  }
}

function updateProgress(percent, message) {
  compressionState.progress = percent;
  compressionState.message = message;
  saveCompressionState();
}

async function saveCompressionState() {
  return new Promise((resolve) => {
    browser.storage.local.set({ compressionState: compressionState }, resolve);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function estimateTokenCount(text) {
  // Rough estimate: ~4 characters per token on average
  return Math.ceil(text.length / 4);
}

function convertToMarkdown(data) {
  const timestamp = new Date().toLocaleString();
  let markdown = `# Claude Conversation\n\n`;
  markdown += `**Extracted:** ${timestamp}\n\n`;
  markdown += `---\n\n`;
  
  data.messages.forEach(message => {
    const roleLabel = message.role === 'user' ? '👤 **User**' : '🤖 **Claude**';
    markdown += `${roleLabel}: ${message.content}\n\n`;
  });
  
  return markdown;
}

function convertToCompressedMarkdown(data) {
  const timestamp = new Date().toLocaleString();
  let markdown = `# Compressed Claude Conversation\n\n`;
  markdown += `**Extracted:** ${timestamp}\n`;
  markdown += `**Original messages:** ${data.originalMessageCount}\n`;
  markdown += `**Compressed messages:** ${data.messages.length}\n`;
  
  if (data.compressionStats) {
    markdown += `**Original tokens:** ${data.compressionStats.originalTokens.toLocaleString()}\n`;
    markdown += `**Compressed tokens:** ${data.compressionStats.compressedTokens.toLocaleString()}\n`;
    markdown += `**Tokens reduced:** ${data.compressionStats.tokensReduced.toLocaleString()}\n`;
    markdown += `**Compression ratio:** ${data.compressionStats.compressionRatio}% reduction\n`;
  }
  
  markdown += `\n---\n\n`;
  
  data.messages.forEach(message => {
    const roleLabel = message.role === 'user' ? '👤 **User**' : '🤖 **Claude**';
    markdown += `${roleLabel}: ${message.content}\n\n`;
  });
  
  return markdown;
}

async function testClaudeAPI(apiKey) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 50,
        messages: [
          {
            role: 'user',
            content: 'Hello World! Just testing the API connection.'
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Claude API Error:', error);
    throw error;
  }
}

async function compressMessage(apiKey, currentMessage, compressedContext, messageRole) {
  try {
    // Create the compression prompt
    let systemPrompt = `You are an expert at intelligently compressing conversations like a human would remember them. Extract the ESSENCE and KEY INSIGHTS, not every detail. Think: "What would someone need to understand the core value and decisions from this conversation?"

COMPRESSION PHILOSOPHY:
Think like human memory - remember the "why" and "what matters" more than verbose explanations.

HIERARCHY OF IMPORTANCE:
1. **CRITICAL** - Decisions made, problems solved, key insights, conclusions reached
2. **IMPORTANT** - Core technical architecture, main approaches, significant context changes  
3. **USEFUL** - Specific examples that illustrate key points, important references
4. **NOISE** - Verbose explanations, obvious details, repetitive clarifications

INTELLIGENT ABSTRACTION:
- **Technical Details** → Extract architectural understanding, not implementation minutiae
- **Long Explanations** → Capture the core insight in 1-2 sentences
- **Code/Database Discussions** → Remember the approach and key decisions, not every line
- **Problem Solving** → Focus on the solution and reasoning, not the entire debugging process
- **Examples** → Keep only those that add unique insight or will be referenced later

CONTEXTUAL COMPRESSION:
- **Build on Context**: Reference previously established points rather than re-explaining
- **Avoid Redundancy**: If something is already in the compressed context, just reference it
- **Natural Flow**: Maintain conversation progression and logical connections
- **Cross-References**: Handle "as mentioned earlier" and forward references intelligently

SPECIFIC FOCUS:
- Extract WHY decisions were made, not just WHAT was decided
- Preserve outcomes and conclusions over process details
- Keep questions and action items that drive the conversation forward
- Maintain speaker intent and key emotional/tonal shifts
- Remember critical constraints, requirements, and trade-offs

OUTPUT: Return ONLY the compressed message content - no prefixes, explanations, or meta-commentary. Be aggressive about compression while preserving essence.

The message is from: ${messageRole}`;

    let userPrompt = '';
    if (compressedContext && compressedContext.trim()) {
      userPrompt = `COMPRESSED CONVERSATION SO FAR:
${compressedContext}

NEXT MESSAGE TO COMPRESS:
${currentMessage}`;
    } else {
      userPrompt = `FIRST MESSAGE TO COMPRESS:
${currentMessage}`;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return data.content[0].text;
  } catch (error) {
    console.error('Claude Compression Error:', error);
    throw error;
  }
} 