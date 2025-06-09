// Background script to handle API requests and background processing
let compressionState = {
  isRunning: false,
  currentStep: 0,
  totalSteps: 0,
  progress: 0,
  message: '',
  type: null, // 'extract' or 'compress'
  data: null,
  error: null
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
      error: null
    };
    browser.storage.local.remove(['compressionState']);
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
      error: null
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
    
    updateProgress(50, 'Converting to markdown...');
    const markdown = convertToMarkdown(conversationData);
    await sleep(500);
    
    updateProgress(75, 'Preparing download...');
    await sleep(500);
    
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
    
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const progressPercent = (i / messages.length) * 80; // 0-80% for compression
      updateProgress(progressPercent, `Compressing message ${i + 1}/${messages.length}${debugSuffix}...`);
      
      // Compress the message
      const compressedContent = await compressMessage(apiKey, message.content, compressedContext, message.role);
      
      const compressedMessage = {
        role: message.role,
        content: compressedContent
      };
      compressedMessages.push(compressedMessage);
      
      // Update compressed context for next message
      const roleLabel = message.role === 'user' ? '👤 **User**' : '🤖 **Claude**';
      compressedContext += `${roleLabel}: ${compressedContent}\n\n`;
      
      compressionState.currentStep = i + 1;
      await saveCompressionState();
    }
    
    updateProgress(85, 'Generating compressed markdown...');
    
    // Create compressed conversation data
    const compressedData = {
      ...conversationData,
      messages: compressedMessages,
      originalMessageCount: messages.length,
      compressionDate: new Date().toISOString()
    };
    
    const compressedMarkdown = convertToCompressedMarkdown(compressedData);
    
    updateProgress(100, 'Compression complete!');
    
    compressionState.data = {
      conversationData: compressedData,
      markdown: compressedMarkdown,
      type: 'compressed',
      originalMessageCount: messages.length
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
  markdown += `**Compressed messages:** ${data.messages.length}\n\n`;
  markdown += `---\n\n`;
  
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
    let systemPrompt = `You are an expert at compressing conversations while preserving essential information, nuance, and context. Your task is to compress a single message from a conversation.

COMPRESSION PRINCIPLES:
1. **Preserve Quotes**: Keep exact quotes, specific phrases, and precise language when they convey important meaning
2. **Avoid Bias**: Maintain objectivity - don't add interpretations or opinions not present in the original
3. **Focus on What's Actually Conveyed**: Capture the real substance, intent, and core message content
4. **Include Meta Aspects**: Preserve tone, style, emotional context, and communication patterns when relevant
5. **Contextual Relevance**: Save information that builds on or relates to previous context, even if it seems minor
6. **Avoid Redundancy**: Don't repeat information already captured in the compressed context
7. **Maintain Flow**: Ensure the compressed message maintains logical connection to the conversation

SPECIFIC GUIDELINES:
- Keep specific examples, code snippets, URLs, names, and technical details
- Preserve questions, requests, and action items
- Maintain the speaker's voice and communication style
- Note important shifts in topic, tone, or approach
- Keep information that might be referenced later in the conversation
- Preserve numerical data, dates, and specific measurements
- Maintain cause-and-effect relationships and logical reasoning

OUTPUT: Return ONLY the compressed message content - no prefixes, explanations, or meta-commentary.

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