// Background script to handle API requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
  }
});

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
    let systemPrompt = `You are an expert at compressing conversations while preserving essential information. Your task is to compress a single message from a conversation.

INSTRUCTIONS:
1. You will be given the compressed conversation so far (if any) and the next message to compress
2. Remove non-essential content but keep relevant details, themes, and key information
3. Consider what's already been covered in the compressed context to avoid redundancy
4. Maintain the core meaning and important specifics
5. Return ONLY the compressed message content, nothing else - no prefixes like "Here's the compressed version:" or explanations

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