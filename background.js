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
  if (request.action === 'testOpenAIAPI') {
    testOpenAIAPI(request.apiKey)
      .then(response => sendResponse({ success: true, data: response }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    
    return true;
  } else if (request.action === 'compressConversation') {
    compressConversation(request.apiKey, request.conversationText)
      .then(response => sendResponse({ success: true, data: response }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    
    return true;
  } else if (request.action === 'startBackgroundOperation') {
    startBackgroundOperation(request.type, request.data, request.apiKey, request.chunkSize)
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

async function startBackgroundOperation(type, conversationData, apiKey, chunkSize) {
  try {
    if (compressionState.isRunning) {
      throw new Error('Operation already in progress');
    }

    compressionState = {
      isRunning: true,
      currentStep: 0,
      totalSteps: type === 'compress' ? 1 : 4, // Single step for compression
      progress: 0,
      message: `Starting ${type} operation...`,
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
      await handleExtractOperation(conversationData);
    } else if (type === 'compress') {
      await handleCompressOperation(conversationData, apiKey, chunkSize || 5000);
    }

  } catch (error) {
    compressionState.error = error.message;
    compressionState.isRunning = false;
    await saveCompressionState();
    throw error;
  }
}

async function handleExtractOperation(conversationData) {
  try {
    updateProgress(25, 'Processing messages...');
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

async function handleCompressOperation(conversationData, apiKey, chunkSize) {
  try {
    const messages = conversationData.messages;
    
    // Convert all messages to a single text with role markers
    const fullText = messages.map(m => `${m.role === 'user' ? '👤 **User**' : '🤖 **GPT-4**'}: ${m.content}`).join('\n\n');
    
    // Calculate original token count
    const originalTokens = estimateTokenCount(fullText);
    compressionState.compression.originalTokens = originalTokens;
    
    updateProgress(5, `Processing conversation (${originalTokens.toLocaleString()} tokens)...`);
    
        // Check if operation was cancelled
        if (!compressionState.isRunning) {
          throw new Error('Operation cancelled by user');
        }
        
    // Split into chunks
    const chunks = splitTextIntoChunks(fullText, chunkSize);
    const totalChunks = chunks.length;
    
    updateProgress(10, `Split into ${totalChunks} chunks of ~${chunkSize.toLocaleString()} tokens each...`);
    
    // Process all chunks in parallel
    updateProgress(15, `Starting parallel compression of ${totalChunks} chunks...`);
    
    let completedChunks = 0;
    
    const chunkPromises = chunks.map(async (chunk, index) => {
      // Check if operation was cancelled before starting each chunk
      if (!compressionState.isRunning) {
        throw new Error('Operation cancelled by user');
      }
      
      const chunkTokens = estimateTokenCount(chunk);
      
      try {
        const compressedChunk = await compressConversation(apiKey, chunk);
        const compressedChunkTokens = estimateTokenCount(compressedChunk);
        
        // Increment completed count and update progress
        completedChunks++;
        const progressPercent = 20 + (completedChunks * 60 / totalChunks);
        updateProgress(progressPercent, `Completed ${completedChunks}/${totalChunks} chunks\nChunk ${index + 1}: ${chunkTokens.toLocaleString()}→${compressedChunkTokens.toLocaleString()} tokens`);
        
        return {
          index: index,
          original: chunk,
          compressed: compressedChunk,
          originalTokens: chunkTokens,
          compressedTokens: compressedChunkTokens
        };
      } catch (error) {
        completedChunks++;
        const progressPercent = 20 + (completedChunks * 60 / totalChunks);
        updateProgress(progressPercent, `Completed ${completedChunks}/${totalChunks} chunks\n❌ Chunk ${index + 1} failed: ${error.message}`);
        throw error;
      }
    });
        
    // Wait for all chunks to complete
    const chunkResults = await Promise.all(chunkPromises);
    
    // Sort results by original index to maintain order
    chunkResults.sort((a, b) => a.index - b.index);
    
    const compressedChunks = chunkResults.map(result => result.compressed);
    const totalCompressedTokens = chunkResults.reduce((sum, result) => sum + result.compressedTokens, 0);
    
    // Check if operation was cancelled
    if (!compressionState.isRunning) {
      throw new Error('Operation cancelled by user');
    }
    
    updateProgress(85, 'Combining compressed chunks...');
    
    // Combine all compressed chunks
    const compressedContent = compressedChunks.join('\n\n---\n\n');
        
    // Update final token counts
    const finalCompressedTokens = estimateTokenCount(compressedContent);
    compressionState.compression.compressedTokens = finalCompressedTokens;
    compressionState.compression.ratio = ((originalTokens - finalCompressedTokens) / originalTokens * 100);
      
      // Final compression stats
    const finalRatio = compressionState.compression.ratio.toFixed(1);
    const tokenReduction = originalTokens - finalCompressedTokens;
    
    updateProgress(90, 'Generating compressed markdown...');
      
      // Create compressed conversation data
      const compressedData = {
        ...conversationData,
      compressedText: compressedContent,
        originalMessageCount: messages.length,
        compressionDate: new Date().toISOString(),
      compressionMethod: `chunked-gpt-4.1-${totalChunks}chunks`,
        compressionStats: {
          originalTokens: originalTokens,
        compressedTokens: finalCompressedTokens,
          tokensReduced: tokenReduction,
        compressionRatio: finalRatio,
        chunksProcessed: totalChunks,
        chunkSize: chunkSize
        }
      };
      
    const compressedMarkdown = convertToChunkedCompressedMarkdown(compressedData);
      
    updateProgress(100, `✅ Compression Complete!\n🎯 ${originalTokens.toLocaleString()}→${finalCompressedTokens.toLocaleString()} tokens (${finalRatio}% reduction, ${totalChunks} chunks)`);
      
      compressionState.data = {
        conversationData: compressedData,
        markdown: compressedMarkdown,
        type: 'compressed',
        originalMessageCount: messages.length,
        compressionStats: compressedData.compressionStats
      };
    compressionState.currentStep = 1;
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

function splitTextIntoChunks(text, maxTokensPerChunk) {
  const chunks = [];
  const estimatedTokens = estimateTokenCount(text);
  
  // If text is smaller than chunk size, return as single chunk
  if (estimatedTokens <= maxTokensPerChunk) {
    return [text];
  }
  
  // Split by double newlines (conversation boundaries) first
  const sections = text.split('\n\n');
  let currentChunk = '';
  let currentTokens = 0;
  
  for (const section of sections) {
    const sectionTokens = estimateTokenCount(section);
    
    // If adding this section would exceed chunk size, start a new chunk
    if (currentTokens + sectionTokens > maxTokensPerChunk && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = section;
      currentTokens = sectionTokens;
    } else {
      // Add section to current chunk
      currentChunk = currentChunk ? `${currentChunk}\n\n${section}` : section;
      currentTokens += sectionTokens;
    }
    
    // If a single section is too large, split it further
    if (sectionTokens > maxTokensPerChunk) {
      const words = section.split(' ');
      let wordChunk = '';
      let wordTokens = 0;
      
      for (const word of words) {
        const wordTokenCount = estimateTokenCount(word + ' ');
        
        if (wordTokens + wordTokenCount > maxTokensPerChunk && wordChunk) {
          chunks.push(wordChunk.trim());
          wordChunk = word;
          wordTokens = wordTokenCount;
        } else {
          wordChunk = wordChunk ? `${wordChunk} ${word}` : word;
          wordTokens += wordTokenCount;
        }
      }
      
      if (wordChunk) {
        currentChunk = wordChunk;
        currentTokens = wordTokens;
      }
    }
  }
  
  // Add the last chunk if it has content
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
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

function convertToSingleShotCompressedMarkdown(data) {
  const timestamp = new Date().toLocaleString();
  let markdown = `# Compressed Conversation (GPT-4.1)\n\n`;
  markdown += `**Extracted:** ${timestamp}\n`;
  markdown += `**Original messages:** ${data.originalMessageCount}\n`;
  markdown += `**Compression method:** ${data.compressionMethod}\n`;
  
  if (data.compressionStats) {
    markdown += `**Original tokens:** ${data.compressionStats.originalTokens.toLocaleString()}\n`;
    markdown += `**Compressed tokens:** ${data.compressionStats.compressedTokens.toLocaleString()}\n`;
    markdown += `**Tokens reduced:** ${data.compressionStats.tokensReduced.toLocaleString()}\n`;
    markdown += `**Compression ratio:** ${data.compressionStats.compressionRatio}% reduction\n`;
  }
  
  markdown += `\n---\n\n`;
  markdown += data.compressedText;
  
  return markdown;
}

function convertToChunkedCompressedMarkdown(data) {
  const timestamp = new Date().toLocaleString();
  let markdown = `# Compressed Conversation (GPT-4.1 Chunked)\n\n`;
  markdown += `**Extracted:** ${timestamp}\n`;
  markdown += `**Original messages:** ${data.originalMessageCount}\n`;
  markdown += `**Compression method:** ${data.compressionMethod}\n`;
  
  if (data.compressionStats) {
    markdown += `**Original tokens:** ${data.compressionStats.originalTokens.toLocaleString()}\n`;
    markdown += `**Compressed tokens:** ${data.compressionStats.compressedTokens.toLocaleString()}\n`;
    markdown += `**Tokens reduced:** ${data.compressionStats.tokensReduced.toLocaleString()}\n`;
    markdown += `**Compression ratio:** ${data.compressionStats.compressionRatio}% reduction\n`;
    markdown += `**Chunks processed:** ${data.compressionStats.chunksProcessed}\n`;
    markdown += `**Chunk size:** ${data.compressionStats.chunkSize.toLocaleString()} tokens\n`;
  }
  
  markdown += `\n---\n\n`;
  markdown += data.compressedText;
  
  return markdown;
}

async function testOpenAIAPI(apiKey) {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4.1',
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
    console.error('OpenAI API Error:', error);
    throw error;
  }
}

async function compressConversation(apiKey, conversationText) {
  try {
    // Create the compression prompt for single-shot compression
    const systemPrompt = `You are an expert at intelligently compressing and distilling conversations while preserving all essential information. Your task is to create a comprehensive yet concise version of the conversation that captures its essence.

TARGET OUTPUT SIZE: 
- Approximately 2,000 tokens (about 1,500 words)
- This should be a substantial distillation that preserves all key information while being significantly more concise than the original

COMPRESSION PHILOSOPHY:
Create an intelligent summary that someone can read to understand all the important developments, decisions, and insights from the conversation. Focus on substance over verbose explanations.

WHAT TO PRESERVE:
1. **Key Decisions & Solutions** - All important conclusions and action items
2. **Essential Context** - Background needed to understand the discussion
3. **Technical Details** - Important implementation details and architectural decisions
4. **Problem-Solution Flow** - How issues were identified and resolved
5. **Important Examples** - Concrete examples that illustrate key points

WHAT TO COMPRESS:
- Verbose explanations → Concise but complete summaries
- Repetitive content → Single clear statements
- Exploratory discussion → Focus on final conclusions
- Step-by-step processes → Key outcomes and decisions

CONVERSATION PROCESSING:
- **Maintain Flow**: Preserve logical progression of the conversation
- **Role Clarity**: Use 👤 **User** / 🤖 **Assistant** markers
- **Complete Coverage**: Include all major topics and decisions
- **Natural Structure**: Organize content in a readable, flowing narrative

OUTPUT REQUIREMENTS:
- Target 2,000 tokens (1,500 words) - substantial but compressed
- Include all major topics and key decisions
- Maintain conversational context and flow
- Focus on essential information over exhaustive detail
- Create a comprehensive yet concise reference document`;

         const userPrompt = `Compress and distill this conversation into approximately 2,000 tokens (1,500 words). Preserve all essential information while creating a more concise, readable version:

${conversationText}

Focus on key decisions, important context, and essential details. Make it comprehensive but significantly more concise than the original.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4.1',
        max_tokens: 3000, // Allow some buffer above 2k target
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
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
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Claude Compression Error:', error);
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

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4.1',
        max_tokens: 1000,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
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
    return data.choices[0].message.content;
  } catch (error) {
    console.error('OpenAI Compression Error:', error);
    throw error;
  }
} 