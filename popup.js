document.addEventListener('DOMContentLoaded', function() {
  const extractButton = document.getElementById('extractChat');
  const compressButton = document.getElementById('compressChat');
  const statusDiv = document.getElementById('status');
  const outputDiv = document.getElementById('output');
  const mainContent = document.getElementById('mainContent');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsPanel = document.getElementById('settings');
  const apiKeyInput = document.getElementById('apiKey');
  const chunkSizeInput = document.getElementById('chunkSize');
  const resetChunkSizeBtn = document.getElementById('resetChunkSize');
  const saveSettingsBtn = document.getElementById('saveSettings');
  const cancelSettingsBtn = document.getElementById('cancelSettings');
  const keyStatus = document.getElementById('keyStatus');
  const removeKeyBtn = document.getElementById('removeKey');

  const progressSection = document.getElementById('progress');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const cancelBtn = document.getElementById('cancelBtn');
  
  let progressInterval = null;
  
  // Load saved API key and ensure chunk size defaults to 5000
  loadSettings();
  
  // Check for ongoing operations when popup loads
  checkForOngoingOperation();
  
  // Clean up interval when popup is closed
  window.addEventListener('beforeunload', function() {
    if (progressInterval) {
      clearInterval(progressInterval);
    }
  });
  
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
  
  function checkForOngoingOperation() {
    browser.runtime.sendMessage({ action: 'getCompressionState' }, function(response) {
      if (response && response.state) {
        const state = response.state;
        if (state.isRunning) {
          // Operation is running in background
          setButtonsDisabled(true);
          showProgress(true);
          updateProgress(state.progress, state.message);
          startProgressPolling();
        } else if (state.data && !state.error) {
          // Operation completed successfully
          handleCompletedOperation(state);
        } else if (state.error) {
          // Operation failed
          showError(`Operation failed: ${state.error}`);
          clearBackgroundState();
        }
      }
    });
  }
  
  function startProgressPolling() {
    if (progressInterval) {
      clearInterval(progressInterval);
    }
    
    progressInterval = setInterval(function() {
      browser.runtime.sendMessage({ action: 'getCompressionState' }, function(response) {
        if (response && response.state) {
          const state = response.state;
          
          if (state.isRunning) {
            updateProgress(state.progress, state.message);
          } else if (state.data && !state.error) {
            // Operation completed successfully
            clearInterval(progressInterval);
            progressInterval = null;
            handleCompletedOperation(state);
          } else if (state.error) {
            // Operation failed or cancelled
            clearInterval(progressInterval);
            progressInterval = null;
            if (state.error.includes('cancelled')) {
              // Operation was cancelled - show cancel message briefly then clear
              outputDiv.innerHTML = `
                <div class="status error">
                  ⚠️ Operation cancelled
                </div>
              `;
              setTimeout(() => {
                outputDiv.innerHTML = '';
              }, 2000);
            } else {
              showError(`Operation failed: ${state.error}`);
            }
            showProgress(false);
            setButtonsDisabled(false);
            clearBackgroundState();
          }
        }
      });
    }, 250); // Poll every 250ms for more responsive updates
  }
  
  function handleCompletedOperation(state) {
    updateProgress(100, 'Complete!');
    
    if (state.type === 'extract') {
      displaySuccess(state.data.conversationData, state.data.markdown, 'markdown');
    } else if (state.type === 'compress') {
      displayCompressedSuccess(state.data);
    }
    
    setTimeout(() => {
      showProgress(false);
      setButtonsDisabled(false);
      clearBackgroundState();
    }, 2000);
  }
  
  function displayCompressedSuccess(data) {
    // Automatically download the compressed markdown
    downloadCompressedMarkdown(data.markdown, data.conversationData);
    
    // Show success message with prettier compression stats
    let statsHtml = '';
    if (data.compressionStats) {
      const stats = data.compressionStats;
      const methodInfo = data.conversationData.compressionMethod ? `
          <div class="stat-row">
            <span class="stat-label">
              <span>⚙️</span>
              <span>Method</span>
            </span>
            <span class="stat-value">${data.conversationData.compressionMethod}</span>
          </div>` : '';
      
      statsHtml = `
        <div class="compression-stats">
          <h4>📊 Compression Results</h4>
          <div class="stat-row">
            <span class="stat-label">
              <span>📝</span>
              <span>Original</span>
            </span>
            <span class="stat-value">${stats.originalTokens.toLocaleString()} tokens</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">
              <span>⚡</span>
              <span>Compressed</span>
            </span>
            <span class="stat-value">${stats.compressedTokens.toLocaleString()} tokens</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">
              <span>💾</span>
              <span>Tokens Saved</span>
            </span>
            <span class="stat-value">${stats.tokensReduced.toLocaleString()}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">
              <span>🎯</span>
              <span>Reduction</span>
            </span>
            <span class="compression-ratio">${stats.compressionRatio}%</span>
          </div>
          ${methodInfo}
        </div>
      `;
    }
    
    outputDiv.innerHTML = `
      <div class="success">
        <h3>✅ Compression Successful!</h3>
        <p>Compressed ${data.originalMessageCount} messages and downloaded as markdown file.</p>
        ${statsHtml}
        <p style="margin-top: 12px; color: #86efac;">📁 Compressed version downloaded</p>
      </div>
    `;
  }
  
  function clearBackgroundState() {
    browser.runtime.sendMessage({ action: 'clearCompressionState' });
  }
  
  function cancelOperation() {
    cancelBtn.disabled = true;
    updateProgress(0, 'Cancelling operation...');
    
    browser.runtime.sendMessage({ action: 'cancelOperation' }, function(response) {
      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }
      
      showProgress(false);
      setButtonsDisabled(false);
      
      outputDiv.innerHTML = `
        <div class="status error">
          ⚠️ Operation cancelled by user
        </div>
      `;
      
      setTimeout(() => {
        outputDiv.innerHTML = '';
      }, 3000);
    });
  }
  
  extractButton.addEventListener('click', function() {
    if (extractButton.disabled) return;
    
    startOperation('extract');
  });
  
  compressButton.addEventListener('click', function() {
    if (compressButton.disabled) return;
    
    startOperation('compress');
  });
  
  cancelBtn.addEventListener('click', function() {
    if (cancelBtn.disabled) return;
    
    cancelOperation();
  });
  
  function startOperation(type) {
    // Clear any previous state
    clearBackgroundState();
    
    // Disable both buttons and show progress
    setButtonsDisabled(true);
    showProgress(true);
    updateProgress(10, 'Extracting conversation data...');
    
    // Inject content script to extract conversation
    browser.tabs.query({active: true, currentWindow: true}, function(tabs) {
      browser.tabs.executeScript(tabs[0].id, {
        file: 'content.js'
      }, function(results) {
        if (results && results[0]) {
          const conversationData = results[0];
          
          if (type === 'compress') {
            // Load API key and chunk size for compression
            browser.storage.local.get(['claudeApiKey', 'chunkSize'], function(result) {
              if (!result.claudeApiKey) {
                showError('Please add your OpenAI API key in settings first');
                showProgress(false);
                setButtonsDisabled(false);
                return;
              }
              
              const chunkSize = result.chunkSize || 5000;
              
              // Start background operation with chunk size
              startBackgroundOperation(type, conversationData, result.claudeApiKey, chunkSize);
            });
          } else {
            // Start background operation for extract
            startBackgroundOperation(type, conversationData);
          }
        } else {
          showError('Failed to extract conversation data');
          showProgress(false);
          setButtonsDisabled(false);
        }
      });
    });
  }
  
  function startBackgroundOperation(type, conversationData, apiKey = null, chunkSize = null) {
    updateProgress(20, 'Starting background operation...');
    
    // Start polling immediately - don't wait for response
    startProgressPolling();
    
    browser.runtime.sendMessage({
      action: 'startBackgroundOperation',
      type: type,
      data: conversationData,
      apiKey: apiKey,
      chunkSize: chunkSize
    }, function(response) {
      if (!response || !response.success) {
        // Only stop polling and show error if the operation failed to start
        clearInterval(progressInterval);
        progressInterval = null;
        showError(`Failed to start ${type} operation: ${response ? response.error : 'No response'}`);
        showProgress(false);
        setButtonsDisabled(false);
      }
      // If successful, polling is already running and will handle the rest
    });
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
    cancelBtn.style.display = show ? 'block' : 'none';
    if (!show) {
      progressFill.style.width = '0%';
      progressText.textContent = 'Processing...';
      cancelBtn.disabled = false;
    }
  }
  
  function updateProgress(percent, message) {
    progressFill.style.width = percent + '%';
    
    // Handle multi-line messages for better formatting
    if (message.includes('\n')) {
      const lines = message.split('\n');
      progressText.innerHTML = `
        <div>${lines[0]}</div>
        ${lines[1] ? `<span class="token-info">${lines[1]}</span>` : ''}
      `;
    } else {
      progressText.textContent = message;
    }
  }
  
  function testClaudeAPI(apiKey) {
    updateProgress(50, 'Sending test message...');
    
    // Send message to background script to handle API call
    browser.runtime.sendMessage({
      action: 'testOpenAIAPI',
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
              <p>GPT-4 responded: "${data.choices[0].message.content}"</p>
              <p>Model: ${data.model}</p>
              <p>Tokens used: ${data.usage.prompt_tokens} input, ${data.usage.completion_tokens} output</p>
            </div>
          `;
          
          setTimeout(() => {
            showProgress(false);
            setButtonsDisabled(false);
          }, 2000);
        }, 500);
      } else {
        console.error('OpenAI API Error:', response.error);
        showError(`API Test Failed: ${response.error}`);
        showProgress(false);
        setButtonsDisabled(false);
      }
    });
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
    const chunkSize = parseInt(chunkSizeInput.value) || 5000;
    
    // Prepare settings object
    const settings = { chunkSize: chunkSize };
    if (apiKey) {
      settings.claudeApiKey = apiKey;
    }
    
    if (apiKey) {
      // Save to browser storage
      browser.storage.local.set(settings, function() {
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
              // If API key is empty, remove it but keep chunk size
        browser.storage.local.remove(['claudeApiKey']);
        browser.storage.local.set({ chunkSize: chunkSize }, function() {
        updateKeyStatus(false);
        
        const originalText = saveSettingsBtn.textContent;
        saveSettingsBtn.textContent = 'Saved! ✅';
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
  
  resetChunkSizeBtn.addEventListener('click', function() {
    // Reset chunk size to default
    chunkSizeInput.value = 5000;
    
    // Show visual feedback
    const originalText = resetChunkSizeBtn.textContent;
    resetChunkSizeBtn.textContent = '✓';
    setTimeout(() => {
      resetChunkSizeBtn.textContent = originalText;
    }, 1000);
  });
  
  function loadSettings() {
    browser.storage.local.get(['claudeApiKey', 'chunkSize'], function(result) {
      if (result.claudeApiKey) {
        apiKeyInput.value = result.claudeApiKey;
        updateKeyStatus(true);
      } else {
        apiKeyInput.value = '';
        updateKeyStatus(false);
      }
      
      // Load chunk size setting (default to 5000)
      const chunkSize = result.chunkSize || 5000;
      chunkSizeInput.value = chunkSize;
      
      // If no chunk size was saved, save the default
      if (!result.chunkSize) {
        browser.storage.local.set({ chunkSize: 5000 });
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