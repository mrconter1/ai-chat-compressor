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