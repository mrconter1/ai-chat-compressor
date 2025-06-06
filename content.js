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
        // Check if it's a user message
        const userMessage = container.querySelector('[data-testid="user-message"]');
        if (userMessage) {
          messages.push({
            index: index,
            type: 'user',
            content: extractTextContent(userMessage),
            timestamp: new Date().toISOString()
          });
          return;
        }
        
        // Check if it's a Claude message
        const claudeMessage = container.querySelector('.font-claude-message');
        if (claudeMessage) {
          messages.push({
            index: index,
            type: 'assistant',
            content: extractTextContent(claudeMessage),
            timestamp: new Date().toISOString()
          });
          return;
        }
        
        // Fallback: try to detect by content patterns
        const textContent = container.textContent || '';
        if (textContent.trim().length > 10) {
          // Try to determine message type by position or other clues
          const isUser = container.querySelector('.bg-text-200') !== null; // User avatar styling
          
          messages.push({
            index: index,
            type: isUser ? 'user' : 'assistant',
            content: textContent.trim(),
            timestamp: new Date().toISOString()
          });
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