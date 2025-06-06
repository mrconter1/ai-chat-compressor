document.addEventListener('DOMContentLoaded', function() {
  const helloButton = document.getElementById('sayHello');
  const extractButton = document.getElementById('extractChat');
  const statusDiv = document.getElementById('status');
  const outputDiv = document.getElementById('output');
  
  // Check if we're on a Claude URL
  browser.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const currentTab = tabs[0];
    const url = currentTab.url;
    
    if (url && url.includes('claude.ai')) {
      statusDiv.innerHTML = '<p style="color: green;">✅ Claude page detected!</p>';
      extractButton.style.display = 'block';
    } else {
      statusDiv.innerHTML = '<p style="color: orange;">⚠️ Please navigate to a Claude conversation page</p>';
      helloButton.style.display = 'block';
    }
  });
  
  helloButton.addEventListener('click', function() {
    alert('Hello from Claude Chat Exporter! 🎉');
  });
  
  extractButton.addEventListener('click', function() {
    // Inject content script to extract conversation
    browser.tabs.query({active: true, currentWindow: true}, function(tabs) {
      browser.tabs.executeScript(tabs[0].id, {
        file: 'content.js'
      }, function(results) {
        if (results && results[0]) {
          const conversationData = results[0];
          displayConversation(conversationData);
        }
      });
    });
  });
  
  function displayConversation(data) {
    if (data.messages && data.messages.length > 0) {
      outputDiv.innerHTML = `
        <div style="margin-top: 15px; padding: 10px; border: 1px solid #ccc; border-radius: 5px; max-height: 200px; overflow-y: auto;">
          <h3>Extracted ${data.messages.length} messages:</h3>
          <pre style="font-size: 11px; white-space: pre-wrap;">${JSON.stringify(data, null, 2)}</pre>
          <button id="downloadJson" style="margin-top: 10px;">Download JSON</button>
        </div>
      `;
      
      document.getElementById('downloadJson').addEventListener('click', function() {
        downloadJSON(data);
      });
    } else {
      outputDiv.innerHTML = '<p style="color: red;">No conversation messages found.</p>';
    }
  }
  
  function downloadJSON(data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'claude_conversation.json';
    a.click();
    URL.revokeObjectURL(url);
  }
}); 