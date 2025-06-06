document.addEventListener('DOMContentLoaded', function() {
  const extractButton = document.getElementById('extractChat');
  const compressButton = document.getElementById('compressChat');
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
  const progressSection = document.getElementById('progress');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  
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
    
    startOperation('extract');
  });
  
  compressButton.addEventListener('click', function() {
    if (compressButton.disabled) return;
    
    startOperation('compress');
  });
  
  function startOperation(type) {
    // Disable both buttons and show progress
    setButtonsDisabled(true);
    showProgress(true);
    
    if (type === 'extract') {
      updateProgress(10, 'Analyzing page content...');
      
      // Inject content script to extract conversation
      browser.tabs.query({active: true, currentWindow: true}, function(tabs) {
        updateProgress(30, 'Extracting conversation data...');
        
        browser.tabs.executeScript(tabs[0].id, {
          file: 'content.js'
        }, function(results) {
          if (results && results[0]) {
            updateProgress(60, 'Processing messages...');
            const conversationData = results[0];
            
            setTimeout(() => {
              updateProgress(80, 'Converting to markdown...');
              const markdown = convertToMarkdown(conversationData);
              
              setTimeout(() => {
                updateProgress(100, 'Complete!');
                displaySuccess(conversationData, markdown, 'markdown');
                
                setTimeout(() => {
                  showProgress(false);
                  setButtonsDisabled(false);
                }, 1000);
              }, 500);
            }, 500);
          } else {
            showError('Failed to extract conversation data');
            showProgress(false);
            setButtonsDisabled(false);
          }
        });
      });
    } else if (type === 'compress') {
      updateProgress(10, 'Getting API key...');
      
      // Load API key and start compression
      browser.storage.local.get(['claudeApiKey'], function(result) {
        if (!result.claudeApiKey) {
          showError('Please add your Claude API key in settings first');
          showProgress(false);
          setButtonsDisabled(false);
          return;
        }
        
        compressConversation(result.claudeApiKey);
      });
    }
  }
  
  function setButtonsDisabled(disabled) {
    extractButton.disabled = disabled;
    compressButton.disabled = disabled;
    
    // Show/hide spinners
    const extractSpinner = extractButton.querySelector('.btn-spinner');
    const extractText = extractButton.querySelector('.btn-text');
    const compressSpinner = compressButton.querySelector('.btn-spinner');
    const compressText = compressButton.querySelector('.btn-text');
    
    if (disabled) {
      extractSpinner.style.display = 'inline';
      extractText.style.display = 'none';
      compressSpinner.style.display = 'inline';
      compressText.style.display = 'none';
    } else {
      extractSpinner.style.display = 'none';
      extractText.style.display = 'inline';
      compressSpinner.style.display = 'none';
      compressText.style.display = 'inline';
    }
  }
  
  function showProgress(show) {
    progressSection.style.display = show ? 'block' : 'none';
    if (!show) {
      progressFill.style.width = '0%';
      progressText.textContent = 'Processing...';
    }
  }
  
  function updateProgress(percent, message) {
    progressFill.style.width = percent + '%';
    progressText.textContent = message;
  }
  
  function testClaudeAPI(apiKey) {
    updateProgress(50, 'Sending test message...');
    
    // Send message to background script to handle API call
    browser.runtime.sendMessage({
      action: 'testClaudeAPI',
      apiKey: apiKey
    }, function(response) {
      if (response.success) {
        updateProgress(90, 'API test successful!');
        
        setTimeout(() => {
          updateProgress(100, 'Connection verified!');
          
          const data = response.data;
          // Show success result
          outputDiv.innerHTML = `
            <div class="success">
              <h3>✅ API Test Successful!</h3>
              <p>Claude responded: "${data.content[0].text}"</p>
              <p>Model: ${data.model}</p>
              <p>Tokens used: ${data.usage.input_tokens} input, ${data.usage.output_tokens} output</p>
            </div>
          `;
          
          setTimeout(() => {
            showProgress(false);
            setButtonsDisabled(false);
          }, 2000);
        }, 500);
      } else {
        console.error('Claude API Error:', response.error);
        showError(`API Test Failed: ${response.error}`);
        showProgress(false);
        setButtonsDisabled(false);
      }
    });
    }

  function compressConversation(apiKey) {
    updateProgress(20, 'Extracting conversation...');
    
    // First extract the conversation
    browser.tabs.query({active: true, currentWindow: true}, function(tabs) {
      browser.tabs.executeScript(tabs[0].id, {
        file: 'content.js'
      }, function(results) {
        if (results && results[0]) {
          const conversationData = results[0];
          
          if (!conversationData.messages || conversationData.messages.length === 0) {
            showError('No conversation found. Make sure you are on a Claude conversation page.');
            showProgress(false);
            setButtonsDisabled(false);
            return;
          }
          
          updateProgress(30, `Compressing ${conversationData.messages.length} messages...`);
          
          // Start the compression process
          compressMessagesSequentially(apiKey, conversationData);
        } else {
          showError('Failed to extract conversation data');
          showProgress(false);
          setButtonsDisabled(false);
        }
      });
    });
  }

  async function compressMessagesSequentially(apiKey, conversationData) {
    try {
      const messages = conversationData.messages;
      let compressedContext = '';
      const compressedMessages = [];
      
      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        const progressPercent = 30 + (i / messages.length) * 50;
        updateProgress(progressPercent, `Compressing message ${i + 1}/${messages.length}...`);
        
        // Send compression request to background script
        const response = await new Promise((resolve) => {
          browser.runtime.sendMessage({
            action: 'compressMessage',
            apiKey: apiKey,
            currentMessage: message.content,
            compressedContext: compressedContext,
            messageRole: message.role
          }, resolve);
        });
        
        if (response.success) {
          const compressedMessage = {
            role: message.role,
            content: response.data
          };
          compressedMessages.push(compressedMessage);
          
          // Update compressed context for next message
          const roleLabel = message.role === 'user' ? '👤 **User**' : '🤖 **Claude**';
          compressedContext += `${roleLabel}: ${response.data}\n\n`;
        } else {
          throw new Error(`Failed to compress message ${i + 1}: ${response.error}`);
        }
      }
      
      updateProgress(85, 'Generating download...');
      
      // Create compressed conversation data
      const compressedData = {
        ...conversationData,
        messages: compressedMessages,
        originalMessageCount: messages.length,
        compressionDate: new Date().toISOString()
      };
      
      // Convert to markdown and download
      const compressedMarkdown = convertToCompressedMarkdown(compressedData);
      downloadCompressedMarkdown(compressedMarkdown, compressedData);
      
      updateProgress(100, 'Compression complete!');
      
      // Show success message
      outputDiv.innerHTML = `
        <div class="success">
          <h3>✅ Compression Successful!</h3>
          <p>Compressed ${messages.length} messages and downloaded as markdown file.</p>
          <p>Original: ${messages.length} messages</p>
          <p>Compressed version downloaded</p>
        </div>
      `;
      
      setTimeout(() => {
        showProgress(false);
        setButtonsDisabled(false);
      }, 2000);
      
    } catch (error) {
      console.error('Compression Error:', error);
      showError(`Compression failed: ${error.message}`);
      showProgress(false);
      setButtonsDisabled(false);
    }
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

  function downloadCompressedMarkdown(content, data) {
    const timestamp = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
    const filename = `compressed_claude_conversation_${timestamp}.md`;
    
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

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
  
  function displaySuccess(data, content, type) {
    if (data.messages && data.messages.length > 0) {
      const fileType = type === 'markdown' ? 'Markdown' : 'JSON';
      const fileExt = type === 'markdown' ? 'md' : 'json';
      
      outputDiv.innerHTML = `
        <div class="success">
          <h3>✅ Success!</h3>
          <p>Extracted ${data.messages.length} messages from this conversation</p>
          <button id="downloadFile" class="download-btn">Download ${fileType} File</button>
        </div>
      `;
      
      document.getElementById('downloadFile').addEventListener('click', function() {
        if (type === 'markdown') {
          downloadMarkdown(content, data);
        } else {
          downloadJSON(data);
        }
      });
    } else {
      showError('No conversation messages found on this page');
    }
  }
  
  function convertToMarkdown(data) {
    let markdown = `# Claude Conversation\n\n`;
    markdown += `**Extracted:** ${new Date().toLocaleString()}\n`;
    markdown += `**Messages:** ${data.messages.length}\n\n`;
    markdown += `---\n\n`;
    
    data.messages.forEach((message, index) => {
      const role = message.role === 'user' ? '👤 **User**' : '🤖 **Claude**';
      markdown += `## ${role}\n\n`;
      markdown += `${message.content}\n\n`;
      
      if (index < data.messages.length - 1) {
        markdown += `---\n\n`;
      }
    });
    
    return markdown;
  }
  
  function downloadMarkdown(content, data) {
    const blob = new Blob([content], {type: 'text/markdown'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    
    // Create filename with date and time
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    
    a.href = url;
    a.download = `claude_conversation_${dateStr}_${timeStr}.md`;
    a.click();
    URL.revokeObjectURL(url);
    
    // Show download success
    const downloadBtn = document.getElementById('downloadFile');
    const originalText = downloadBtn.textContent;
    downloadBtn.textContent = 'Downloaded! ✅';
    setTimeout(() => {
      downloadBtn.textContent = originalText;
    }, 2000);
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
    
    // Create filename with date and time
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    
    a.href = url;
    a.download = `claude_conversation_${dateStr}_${timeStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    // Show download success
    const downloadBtn = document.getElementById('downloadFile');
    const originalText = downloadBtn.textContent;
    downloadBtn.textContent = 'Downloaded! ✅';
    setTimeout(() => {
      downloadBtn.textContent = originalText;
    }, 2000);
  }
}); 