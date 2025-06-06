// Content script to extract Claude conversation data
(function() {
  function extractConversation() {
    const messages = [];
    
    // Try to find conversation messages using multiple selectors
    const selectors = [
      '[data-testid="user-message"]',
      '[data-testid="claude-message"]', 
      '.font-user-message',
      '.font-claude-message',
      '[class*="message"]'
    ];
    
    // Get all message containers
    const messageContainers = document.querySelectorAll('div[data-test-render-count]');
    
        messageContainers.forEach((container, index) => {
      try {
        // Check the direct child div to determine message type
        const firstChild = container.firstElementChild;
        if (!firstChild) return;
        
        // User messages have a child div with "mb-1 mt-1" classes
        const isUserMessage = firstChild.classList.contains('mb-1') && firstChild.classList.contains('mt-1');
        
        // Claude messages have a child div with style="height: auto;" or contain font-claude-message
        const isClaudeMessage = firstChild.style.height === 'auto' || container.querySelector('.font-claude-message');
        
        if (isUserMessage) {
          const userContent = container.querySelector('[data-testid="user-message"]');
          if (userContent) {
            messages.push({
              index: index,
              role: 'user',
              content: extractTextContent(userContent),
              timestamp: new Date().toISOString()
            });
          }
        } else if (isClaudeMessage) {
          const claudeContent = container.querySelector('.font-claude-message');
          if (claudeContent) {
            messages.push({
              index: index,
              role: 'assistant',
              content: extractTextContent(claudeContent),
              timestamp: new Date().toISOString()
            });
          }
        }
        
        // If neither pattern matches but we have significant content, try fallback
        if (!isUserMessage && !isClaudeMessage) {
          const textContent = container.textContent || '';
          if (textContent.trim().length > 10) {
            // Look for user avatar as fallback indicator
            const hasUserAvatar = container.querySelector('.bg-text-200') !== null;
            
            messages.push({
              index: index,
              role: hasUserAvatar ? 'user' : 'assistant',
              content: textContent.trim(),
              timestamp: new Date().toISOString()
            });
          }
        }
      } catch (error) {
        console.log('Error processing message container:', error);
      }
    });
    
    return {
      metadata: {
        source_url: window.location.href,
        title: document.title || 'Claude Conversation',
        extracted_at: new Date().toISOString(),
        total_messages: messages.length,
        extraction_method: 'browser_extension'
      },
      messages: messages
    };
  }
  
  function extractTextContent(element) {
    if (!element) return '';
    
    let text = '';
    
    // Handle different content types
    for (let node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = node.tagName.toLowerCase();
        
        if (tagName === 'br') {
          text += '\n';
        } else if (tagName === 'p') {
          text += extractTextContent(node) + '\n\n';
        } else if (tagName === 'pre' || tagName === 'code') {
          text += '```\n' + node.textContent + '\n```\n';
        } else if (tagName === 'ul' || tagName === 'ol') {
          const items = node.querySelectorAll('li');
          items.forEach(item => {
            text += '- ' + extractTextContent(item) + '\n';
          });
          text += '\n';
        } else if (tagName === 'h1' || tagName === 'h2' || tagName === 'h3') {
          text += '\n### ' + extractTextContent(node) + '\n\n';
        } else {
          text += extractTextContent(node);
        }
      }
    }
    
    return text.trim();
  }
  
  // Return the extracted data
  return extractConversation();
})(); 