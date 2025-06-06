document.addEventListener('DOMContentLoaded', function() {
  const extractButton = document.getElementById('extractChat');
  const statusDiv = document.getElementById('status');
  const outputDiv = document.getElementById('output');
  const mainContent = document.getElementById('mainContent');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsPanel = document.getElementById('settings');
  const apiKeyInput = document.getElementById('apiKey');
  const saveSettingsBtn = document.getElementById('saveSettings');
  const cancelSettingsBtn = document.getElementById('cancelSettings');
  const keyStatus = document.getElementById('keyStatus');
  const removeKeyBtn = document.getElementById('removeKey');
  
  // Load saved API key
  loadSettings();
  
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
  
  // Settings functionality
  settingsBtn.addEventListener('click', function() {
    if (settingsPanel.style.display === 'none') {
      settingsPanel.style.display = 'block';
      loadSettings(); // Refresh the form with current values
    } else {
      settingsPanel.style.display = 'none';
    }
  });
  
  saveSettingsBtn.addEventListener('click', function() {
    const apiKey = apiKeyInput.value.trim();
    
    if (apiKey) {
      // Save to browser storage
      browser.storage.local.set({
        claudeApiKey: apiKey
      }, function() {
        updateKeyStatus(true);
        
        // Show success feedback
        const originalText = saveSettingsBtn.textContent;
        saveSettingsBtn.textContent = 'Saved! ✅';
        setTimeout(() => {
          saveSettingsBtn.textContent = originalText;
          settingsPanel.style.display = 'none';
        }, 1500);
      });
    } else {
      // If empty, remove the key
      browser.storage.local.remove(['claudeApiKey'], function() {
        updateKeyStatus(false);
        
        const originalText = saveSettingsBtn.textContent;
        saveSettingsBtn.textContent = 'Cleared! ✅';
        setTimeout(() => {
          saveSettingsBtn.textContent = originalText;
          settingsPanel.style.display = 'none';
        }, 1500);
      });
    }
  });
  
  cancelSettingsBtn.addEventListener('click', function() {
    settingsPanel.style.display = 'none';
    loadSettings(); // Reset form to saved values
  });
  
  removeKeyBtn.addEventListener('click', function() {
    // Remove API key from storage
    browser.storage.local.remove(['claudeApiKey'], function() {
      // Clear the input and update UI
      apiKeyInput.value = '';
      updateKeyStatus(false);
      
      // Show confirmation
      const originalText = removeKeyBtn.textContent;
      removeKeyBtn.textContent = 'Removed ✅';
      setTimeout(() => {
        removeKeyBtn.textContent = originalText;
      }, 1500);
    });
  });
  
  function loadSettings() {
    browser.storage.local.get(['claudeApiKey'], function(result) {
      if (result.claudeApiKey) {
        apiKeyInput.value = result.claudeApiKey;
        updateKeyStatus(true);
      } else {
        apiKeyInput.value = '';
        updateKeyStatus(false);
      }
    });
  }
  
  function updateKeyStatus(hasKey) {
    if (hasKey) {
      keyStatus.style.display = 'flex';
    } else {
      keyStatus.style.display = 'none';
    }
  }
  
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