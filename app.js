/* ============================================
   POMODORO FOCUS - JavaScript Application
   ============================================ */

// ============================================
// DATA STRUCTURE & STATE
// ============================================

const DEFAULT_DATA = {
    projects: [],
    settings: {
        workDuration: 25,
        shortBreakDuration: 5,
        longBreakDuration: 15,
        sessionsBeforeLongBreak: 4
    },
    stats: {
        totalWorkTime: 0,
        totalBreakTime: 0
    },
    appSessions: []
};

let appData = JSON.parse(JSON.stringify(DEFAULT_DATA));
let currentProjectId = null;
let currentSubtaskId = null;
let timerInterval = null;
let timerRunning = false;
let timerMode = 'pomodoro'; // 'pomodoro', 'shortBreak', 'longBreak'
let timeRemaining = 25 * 60; // in seconds
let currentSession = 1;
let appSessionStartTime = Date.now();
let appSessionInterval = null;

// ============================================
// UTILITY FUNCTIONS
// ============================================

function generateId() {
    return 'id_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatTimerDisplay(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatDateIstanbul() {
    const options = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'Europe/Istanbul'
    };
    return new Date().toLocaleDateString('en-US', options);
}

function formatDateForExport() {
    const date = new Date();
    const day = date.getDate().toString().padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const year = date.getFullYear().toString().slice(-2);
    return `${day}${month}${year}`;
}

function saveData() {
    localStorage.setItem('pomodoroFocusData', JSON.stringify(appData));
}

function loadData() {
    const saved = localStorage.getItem('pomodoroFocusData');
    if (saved) {
        appData = JSON.parse(saved);
    }
}

function calculateProjectTime(project) {
    let totalSessions = 0;
    let completedSessions = 0;
    
    project.subtasks.forEach(subtask => {
        totalSessions += subtask.totalSessions;
        completedSessions += subtask.completedSessions;
    });
    
    const spentTime = completedSessions * appData.settings.workDuration * 60;
    const remainingTime = (totalSessions - completedSessions) * appData.settings.workDuration * 60;
    
    return {
        totalSessions,
        completedSessions,
        spentTime,
        remainingTime,
        progress: totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0
    };
}

// ============================================
// NOTIFICATION SYSTEM
// ============================================

function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function sendNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, {
            body: body,
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🍅</text></svg>',
            tag: 'pomodoro-notification',
            requireInteraction: true
        });
    }
    
    // Also play a sound
    playNotificationSound();
}

function playNotificationSound() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    gainNode.gain.value = 0.3;
    
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    oscillator.stop(audioContext.currentTime + 0.5);
}

// ============================================
// TIMER FUNCTIONS
// ============================================

function setTimerMode(mode) {
    timerMode = mode;
    
    // Update body class
    document.body.className = `mode-${mode}`;
    
    // Update active tab
    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.mode === mode);
    });
    
    // Set time based on mode
    switch (mode) {
        case 'pomodoro':
            timeRemaining = appData.settings.workDuration * 60;
            break;
        case 'shortBreak':
            timeRemaining = appData.settings.shortBreakDuration * 60;
            break;
        case 'longBreak':
            timeRemaining = appData.settings.longBreakDuration * 60;
            break;
    }
    
    updateTimerDisplay();
    
    // Stop timer if running
    if (timerRunning) {
        pauseTimer();
    }
}

function updateTimerDisplay() {
    document.getElementById('timerDisplay').textContent = formatTimerDisplay(timeRemaining);
    document.title = `${formatTimerDisplay(timeRemaining)} - Pomodoro Focus`;
}

function startTimer() {
    if (timerRunning) return;
    
    timerRunning = true;
    document.getElementById('btnStartPause').textContent = 'PAUSE';
    
    timerInterval = setInterval(() => {
        timeRemaining--;
        updateTimerDisplay();
        
        if (timeRemaining <= 0) {
            timerComplete();
        }
    }, 1000);
}

function pauseTimer() {
    timerRunning = false;
    document.getElementById('btnStartPause').textContent = 'START';
    
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function resetTimer() {
    pauseTimer();
    setTimerMode(timerMode);
}

function timerComplete() {
    pauseTimer();
    
    if (timerMode === 'pomodoro') {
        // Work session completed
        sendNotification('Time for a break! 🎉', 'Great work! Take a well-deserved break.');
        
        // Update session count for active subtask
        if (currentProjectId && currentSubtaskId) {
            const project = appData.projects.find(p => p.id === currentProjectId);
            if (project) {
                const subtask = project.subtasks.find(s => s.id === currentSubtaskId);
                if (subtask && subtask.completedSessions < subtask.totalSessions) {
                    subtask.completedSessions++;
                    
                    // Check if subtask is completed
                    if (subtask.completedSessions >= subtask.totalSessions) {
                        subtask.isCompleted = true;
                    }
                    
                    saveData();
                    renderProjectsList();
                    renderProjectDetails();
                }
            }
        }
        
        // Update stats
        appData.stats.totalWorkTime += appData.settings.workDuration * 60;
        saveData();
        
        // Determine next break type
        if (currentSession >= appData.settings.sessionsBeforeLongBreak) {
            currentSession = 1;
            setTimerMode('longBreak');
        } else {
            currentSession++;
            setTimerMode('shortBreak');
        }
        
        updateSessionIndicator();
        
        // Auto-start break
        setTimeout(startTimer, 1000);
        
    } else {
        // Break completed
        sendNotification('Time to focus! 📚', 'Break is over. Let\'s get back to work!');
        
        // Update stats
        const breakDuration = timerMode === 'shortBreak' 
            ? appData.settings.shortBreakDuration 
            : appData.settings.longBreakDuration;
        appData.stats.totalBreakTime += breakDuration * 60;
        saveData();
        
        setTimerMode('pomodoro');
    }
}

function updateSessionIndicator() {
    document.getElementById('sessionCount').textContent = 
        `Session ${currentSession} of ${appData.settings.sessionsBeforeLongBreak}`;
}

// ============================================
// PROJECT MANAGEMENT
// ============================================

function createProject(name, subtasks) {
    const project = {
        id: generateId(),
        name: name,
        createdAt: new Date().toISOString(),
        subtasks: subtasks.map(st => ({
            id: generateId(),
            name: st.name,
            totalSessions: st.sessions,
            completedSessions: 0,
            isCompleted: false
        }))
    };
    
    appData.projects.push(project);
    saveData();
    renderProjectsList();
    
    return project;
}

function selectProject(projectId) {
    currentProjectId = projectId;
    currentSubtaskId = null;
    
    // Update active state in sidebar
    document.querySelectorAll('.project-item').forEach(item => {
        item.classList.toggle('active', item.dataset.id === projectId);
    });
    
    renderProjectDetails();
    updateActiveTaskDisplay();
}

function selectSubtask(projectId, subtaskId) {
    currentProjectId = projectId;
    currentSubtaskId = subtaskId;
    
    // Update active state
    document.querySelectorAll('.subtask-item').forEach(item => {
        item.classList.toggle('active', item.dataset.id === subtaskId);
    });
    
    updateActiveTaskDisplay();
}

function updateActiveTaskDisplay() {
    const projectNameEl = document.getElementById('activeProjectName');
    const subtaskNameEl = document.getElementById('activeSubtaskName');
    
    if (currentProjectId) {
        const project = appData.projects.find(p => p.id === currentProjectId);
        if (project) {
            projectNameEl.textContent = project.name;
            
            if (currentSubtaskId) {
                const subtask = project.subtasks.find(s => s.id === currentSubtaskId);
                if (subtask) {
                    subtaskNameEl.textContent = `${subtask.name} (${subtask.completedSessions}/${subtask.totalSessions} sessions)`;
                    return;
                }
            }
            subtaskNameEl.textContent = 'Select a subtask to begin';
        }
    } else {
        projectNameEl.textContent = 'No project selected';
        subtaskNameEl.textContent = 'Select a subtask to begin';
    }
}

function adjustSubtaskSessions(projectId, subtaskId, delta) {
    const project = appData.projects.find(p => p.id === projectId);
    if (!project) return;
    
    const subtask = project.subtasks.find(s => s.id === subtaskId);
    if (!subtask) return;
    
    const newTotal = subtask.totalSessions + delta;
    if (newTotal >= subtask.completedSessions && newTotal >= 1) {
        subtask.totalSessions = newTotal;
        subtask.isCompleted = subtask.completedSessions >= subtask.totalSessions;
        saveData();
        renderProjectsList();
        renderProjectDetails();
        updateActiveTaskDisplay();
    }
}

// ============================================
// RENDERING FUNCTIONS
// ============================================

function renderProjectsList() {
    const container = document.getElementById('projectsList');
    
    if (appData.projects.length === 0) {
        container.innerHTML = `
            <div class="no-projects">
                <p style="text-align: center; color: var(--text-muted); padding: 2rem;">
                    No projects yet.<br>Click + to create one.
                </p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = appData.projects.map(project => {
        const stats = calculateProjectTime(project);
        return `
            <div class="project-item ${currentProjectId === project.id ? 'active' : ''}" 
                 data-id="${project.id}" 
                 onclick="selectProject('${project.id}')">
                <div class="project-item-name">${escapeHtml(project.name)}</div>
                <div class="project-item-time">${formatTime(stats.spentTime)}</div>
                <div class="project-progress">
                    <div class="project-progress-bar" style="width: ${stats.progress}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

function renderProjectDetails() {
    const section = document.getElementById('projectDetailsSection');
    const titleEl = document.getElementById('projectTitle');
    const timeSpentEl = document.getElementById('timeSpent');
    const timeRemainingEl = document.getElementById('timeRemaining');
    const subtasksContainer = document.getElementById('subtasksContainer');
    
    if (!currentProjectId) {
        titleEl.textContent = 'Select a Project';
        timeSpentEl.textContent = '00:00:00';
        timeRemainingEl.textContent = '00:00:00';
        subtasksContainer.innerHTML = '<p class="no-project-message">Select a project from the sidebar to view its details</p>';
        return;
    }
    
    const project = appData.projects.find(p => p.id === currentProjectId);
    if (!project) return;
    
    const stats = calculateProjectTime(project);
    
    titleEl.textContent = project.name;
    timeSpentEl.textContent = formatTime(stats.spentTime);
    timeRemainingEl.textContent = formatTime(stats.remainingTime);
    
    if (project.subtasks.length === 0) {
        subtasksContainer.innerHTML = '<p class="no-project-message">No subtasks in this project</p>';
        return;
    }
    
    subtasksContainer.innerHTML = project.subtasks.map(subtask => {
        const isActive = currentSubtaskId === subtask.id;
        const statusClass = subtask.isCompleted ? 'completed' : 'incomplete';
        
        return `
            <div class="subtask-item ${isActive ? 'active' : ''}" 
                 data-id="${subtask.id}"
                 onclick="selectSubtask('${project.id}', '${subtask.id}')">
                <div class="subtask-status ${statusClass}"></div>
                <div class="subtask-info">
                    <div class="subtask-name">${escapeHtml(subtask.name)}</div>
                    <div class="subtask-sessions">
                        ${subtask.completedSessions}/${subtask.totalSessions} sessions 
                        (${subtask.totalSessions - subtask.completedSessions} left)
                    </div>
                </div>
                <div class="subtask-controls" onclick="event.stopPropagation()">
                    <button class="btn-session-adjust" onclick="adjustSubtaskSessions('${project.id}', '${subtask.id}', -1)">−</button>
                    <button class="btn-session-adjust" onclick="adjustSubtaskSessions('${project.id}', '${subtask.id}', 1)">+</button>
                </div>
            </div>
        `;
    }).join('');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// MODAL FUNCTIONS
// ============================================

function openAddProjectModal() {
    document.getElementById('addProjectModal').classList.add('active');
    document.getElementById('projectName').value = '';
    document.getElementById('subtasksFormList').innerHTML = '';
    addSubtaskFormItem();
    document.getElementById('projectName').focus();
}

function closeAddProjectModal() {
    document.getElementById('addProjectModal').classList.remove('active');
}

function addSubtaskFormItem() {
    const container = document.getElementById('subtasksFormList');
    const index = container.children.length;
    
    const item = document.createElement('div');
    item.className = 'subtask-form-item';
    item.innerHTML = `
        <input type="text" placeholder="Subtask name..." class="subtask-name-input">
        <input type="number" value="4" min="1" max="99" class="subtask-sessions-input" title="Number of sessions">
        <button class="btn-remove-subtask" onclick="this.parentElement.remove()" title="Remove subtask">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `;
    
    container.appendChild(item);
    item.querySelector('.subtask-name-input').focus();
}

function handleCreateProject() {
    const projectName = document.getElementById('projectName').value.trim();
    if (!projectName) {
        alert('Please enter a project name');
        return;
    }
    
    const subtaskItems = document.querySelectorAll('.subtask-form-item');
    const subtasks = [];
    
    subtaskItems.forEach(item => {
        const name = item.querySelector('.subtask-name-input').value.trim();
        const sessions = parseInt(item.querySelector('.subtask-sessions-input').value) || 4;
        
        if (name) {
            subtasks.push({ name, sessions });
        }
    });
    
    if (subtasks.length === 0) {
        alert('Please add at least one subtask');
        return;
    }
    
    const project = createProject(projectName, subtasks);
    closeAddProjectModal();
    selectProject(project.id);
}

// ============================================
// IMPORT/EXPORT FUNCTIONS
// ============================================

function exportData() {
    // Add current app session to the data
    const sessionDuration = Math.floor((Date.now() - appSessionStartTime) / 1000);
    const exportData = JSON.parse(JSON.stringify(appData));
    
    // Add current session
    const currentSessionEntry = {
        date: formatDateForExport(),
        duration: formatTime(sessionDuration)
    };
    
    // Check if there's already an entry for today
    const todayIndex = exportData.appSessions.findIndex(s => s.date === currentSessionEntry.date);
    if (todayIndex >= 0) {
        // Parse existing duration and add current
        const existingParts = exportData.appSessions[todayIndex].duration.split(':').map(Number);
        const existingSeconds = existingParts[0] * 3600 + existingParts[1] * 60 + existingParts[2];
        exportData.appSessions[todayIndex].duration = formatTime(existingSeconds + sessionDuration);
    } else {
        exportData.appSessions.push(currentSessionEntry);
    }
    
    // Calculate summary stats
    const summary = {
        totalProjects: exportData.projects.length,
        completedSubtasks: 0,
        incompleteSubtasks: 0,
        totalWorkTime: formatTime(exportData.stats.totalWorkTime),
        totalBreakTime: formatTime(exportData.stats.totalBreakTime)
    };
    
    exportData.projects.forEach(project => {
        project.subtasks.forEach(subtask => {
            if (subtask.isCompleted) {
                summary.completedSubtasks++;
            } else {
                summary.incompleteSubtasks++;
            }
        });
    });
    
    exportData.summary = summary;
    
    // Create and download file
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pomodoro-data-${formatDateForExport()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importData(file) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
        try {
            const importedData = JSON.parse(e.target.result);
            
            // Validate basic structure
            if (!importedData.projects || !Array.isArray(importedData.projects)) {
                throw new Error('Invalid data format: missing projects array');
            }
            
            // Merge or replace data
            if (confirm('Do you want to REPLACE all current data? Click Cancel to MERGE instead.')) {
                appData = {
                    ...DEFAULT_DATA,
                    ...importedData,
                    settings: { ...DEFAULT_DATA.settings, ...importedData.settings },
                    stats: { ...DEFAULT_DATA.stats, ...importedData.stats }
                };
            } else {
                // Merge projects (avoid duplicates by ID)
                const existingIds = new Set(appData.projects.map(p => p.id));
                importedData.projects.forEach(project => {
                    if (!existingIds.has(project.id)) {
                        appData.projects.push(project);
                    }
                });
                
                // Merge app sessions
                if (importedData.appSessions) {
                    importedData.appSessions.forEach(session => {
                        const existing = appData.appSessions.find(s => s.date === session.date);
                        if (!existing) {
                            appData.appSessions.push(session);
                        }
                    });
                }
            }
            
            saveData();
            renderProjectsList();
            currentProjectId = null;
            currentSubtaskId = null;
            renderProjectDetails();
            updateActiveTaskDisplay();
            
            alert('Data imported successfully!');
            
        } catch (error) {
            alert('Error importing data: ' + error.message);
        }
    };
    
    reader.readAsText(file);
}

// ============================================
// APP SESSION TIMER
// ============================================

function startAppSessionTimer() {
    appSessionStartTime = Date.now();
    
    appSessionInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - appSessionStartTime) / 1000);
        document.getElementById('appSessionTime').textContent = formatTime(elapsed);
    }, 1000);
}

function saveAppSession() {
    const sessionDuration = Math.floor((Date.now() - appSessionStartTime) / 1000);
    const dateKey = formatDateForExport();
    
    const existingIndex = appData.appSessions.findIndex(s => s.date === dateKey);
    if (existingIndex >= 0) {
        const existingParts = appData.appSessions[existingIndex].duration.split(':').map(Number);
        const existingSeconds = existingParts[0] * 3600 + existingParts[1] * 60 + existingParts[2];
        appData.appSessions[existingIndex].duration = formatTime(existingSeconds + sessionDuration);
    } else {
        appData.appSessions.push({
            date: dateKey,
            duration: formatTime(sessionDuration)
        });
    }
    
    saveData();
}

// ============================================
// EVENT LISTENERS
// ============================================

function initializeEventListeners() {
    // Timer controls
    document.getElementById('btnStartPause').addEventListener('click', () => {
        if (timerRunning) {
            pauseTimer();
        } else {
            startTimer();
        }
    });
    
    document.getElementById('btnReset').addEventListener('click', resetTimer);
    
    // Mode tabs
    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            setTimerMode(tab.dataset.mode);
        });
    });
    
    // Sidebar toggle
    document.getElementById('btnToggleSidebar').addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.toggle('visible');
    });
    
    // Add project modal
    document.getElementById('btnAddProject').addEventListener('click', openAddProjectModal);
    document.getElementById('btnCloseModal').addEventListener('click', closeAddProjectModal);
    document.getElementById('btnCancelProject').addEventListener('click', closeAddProjectModal);
    document.getElementById('btnCreateProject').addEventListener('click', handleCreateProject);
    document.getElementById('btnAddSubtask').addEventListener('click', addSubtaskFormItem);
    
    // Close modal on overlay click
    document.getElementById('addProjectModal').addEventListener('click', (e) => {
        if (e.target.id === 'addProjectModal') {
            closeAddProjectModal();
        }
    });
    
    // Import/Export
    document.getElementById('btnExport').addEventListener('click', exportData);
    document.getElementById('btnImport').addEventListener('click', () => {
        document.getElementById('importInput').click();
    });
    document.getElementById('importInput').addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            importData(e.target.files[0]);
            e.target.value = '';
        }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Space to start/pause (when not in input)
        if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
            e.preventDefault();
            if (timerRunning) {
                pauseTimer();
            } else {
                startTimer();
            }
        }
        
        // Escape to close modal
        if (e.key === 'Escape') {
            closeAddProjectModal();
        }
        
        // Enter in modal to create project
        if (e.key === 'Enter' && document.getElementById('addProjectModal').classList.contains('active')) {
            if (document.activeElement.classList.contains('subtask-name-input')) {
                addSubtaskFormItem();
            } else if (document.activeElement.id === 'projectName') {
                document.querySelector('.subtask-name-input')?.focus();
            }
        }
    });
    
    // Save session on page unload
    window.addEventListener('beforeunload', saveAppSession);
}

// ============================================
// INITIALIZATION
// ============================================

function initialize() {
    // Load saved data
    loadData();
    
    // Set current date
    document.getElementById('currentDate').textContent = formatDateIstanbul();
    
    // Request notification permission
    requestNotificationPermission();
    
    // Initialize timer
    setTimerMode('pomodoro');
    updateSessionIndicator();
    
    // Start app session timer
    startAppSessionTimer();
    
    // Render UI
    renderProjectsList();
    renderProjectDetails();
    updateActiveTaskDisplay();
    
    // Initialize event listeners
    initializeEventListeners();
    
    console.log('Pomodoro Focus initialized! 🍅');
}

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', initialize);
