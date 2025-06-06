document.addEventListener('DOMContentLoaded', function() {
  const extractButton = document.getElementById('extractChat');
  const statusDiv = document.getElementById('status');
  const outputDiv = document.getElementById('output');
  const mainContent = document.getElementById('mainContent');
  
  // Check if we're on a Claude URL
  browser.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const currentTab = tabs[0];
    const url = currentTab.url;
    
    if (url && url.includes('claude.ai')) {
      // On Claude page - enable functionality
      mainContent.classList.remove('disabled-overlay');
      extractButton.disabled = false;
      statusDiv.style.display = 'none'; // Don't show success message
    } else {
      // Not on Claude page - disable and show error
      mainContent.classList.add('disabled-overlay');
      extractButton.disabled = true;
      statusDiv.innerHTML = '<div class="status error">⚠️ Please navigate to a Claude conversation page to use this extension</div>';
    }
  });
  
  extractButton.addEventListener('click', function() {
    if (extractButton.disabled) return;
    
    // Show loading state
    extractButton.textContent = 'Extracting...';
    extractButton.disabled = true;
    
    // Inject content script to extract conversation
    browser.tabs.query({active: true, currentWindow: true}, function(tabs) {
      browser.tabs.executeScript(tabs[0].id, {
        file: 'content.js'
      }, function(results) {
        // Reset button
        extractButton.textContent = 'Extract Conversation';
        extractButton.disabled = false;
        
        if (results && results[0]) {
          const conversationData = results[0];
          displayConversation(conversationData);
        } else {
          showError('Failed to extract conversation data');
        }
      });
    });
  });
  
  function displayConversation(data) {
    if (data.messages && data.messages.length > 0) {
      outputDiv.innerHTML = `
        <div class="success">
          <h3>✅ Success!</h3>
          <p>Extracted ${data.messages.length} messages from this conversation</p>
          <button id="downloadJson" class="download-btn">Download JSON File</button>
        </div>
      `;
      
      document.getElementById('downloadJson').addEventListener('click', function() {
        downloadJSON(data);
      });
    } else {
      showError('No conversation messages found on this page');
    }
  }
  
  function showError(message) {
    outputDiv.innerHTML = `
      <div class="status error">
        ❌ ${message}
      </div>
    `;
  }
  
  function downloadJSON(data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `claude_conversation_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    // Show download success
    const downloadBtn = document.getElementById('downloadJson');
    const originalText = downloadBtn.textContent;
    downloadBtn.textContent = 'Downloaded! ✅';
    setTimeout(() => {
      downloadBtn.textContent = originalText;
    }, 2000);
  }
}); 