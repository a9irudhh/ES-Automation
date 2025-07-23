const BASE_URL = window.location.origin;

let authCredentials = null;

// Login form handler
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');

    const credentials = btoa(`${username}:${password}`);
    
    try {
        const response = await fetch(`${BASE_URL}/api/test-auth`, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${credentials}`
            }
        });
        
        if (response.ok) {
            authCredentials = credentials;
            document.getElementById('loginContainer').style.display = 'none';
            document.getElementById('dashboardContainer').style.display = 'block';
            errorDiv.style.display = 'none';
        } else {
            throw new Error('Invalid credentials');
        }
    } catch (error) {
        errorDiv.textContent = 'Invalid username or password';
        errorDiv.style.display = 'block';
    }
});


document.getElementById('logoutBtn').addEventListener('click', () => {
    authCredentials = null;
    document.getElementById('loginContainer').style.display = 'block';
    document.getElementById('dashboardContainer').style.display = 'none';
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.getElementById('exportMessage').style.display = 'none';
});

document.getElementById('exportForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!authCredentials) {
        alert('Please login first');
        return;
    }
    
    const fromDate = document.getElementById('fromDate').value;
    const toDate = document.getElementById('toDate').value;
    const messageDiv = document.getElementById('exportMessage');
    const submitBtn = e.target.querySelector('button[type="submit"]');
    
    if (!fromDate || !toDate) {
        messageDiv.className = 'error';
        messageDiv.textContent = 'Please select both from and to dates';
        messageDiv.style.display = 'block';
        return;
    }
    
    const fromDateISO = new Date(fromDate).toISOString();
    const toDateISO = new Date(toDate).toISOString();
    
    // Show loading state
    submitBtn.innerHTML = '<span class="loading"></span>Processing...';
    submitBtn.disabled = true;
    messageDiv.style.display = 'none';
    
    try {
        const queryParams = new URLSearchParams({
            fromDate: fromDateISO,
            toDate: toDateISO
        });
        
        const response = await fetch(`${BASE_URL}/api/addToSheets?${queryParams}`, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${authCredentials}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            messageDiv.className = 'success';
            messageDiv.textContent = data.message || 'Data exported successfully!';
        } else {
            // Handle specific error cases
            let errorMessage = data.error || 'Export failed';
            if (data.details) {
                if (data.details.includes('es:ESHttpGet') || data.details.includes('Access Denied')) {
                    errorMessage += ' - AWS credentials may be expired or lack proper permissions. Please contact your administrator.';
                } else {
                    errorMessage += ` - ${data.details}`;
                }
            }
            if (data.suggestion) {
                errorMessage += ` ${data.suggestion}`;
            }
            throw new Error(errorMessage);
        }
    } catch (error) {
        messageDiv.className = 'error';
        messageDiv.textContent = `Error: ${error.message}`;
    } finally {
        submitBtn.innerHTML = 'Export to Sheets';
        submitBtn.disabled = false;
        messageDiv.style.display = 'block';
    }
});


window.addEventListener('load', () => {
    const now = new Date();
    const fromDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    
    const formatDateTime = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    };
    
    document.getElementById('fromDate').value = formatDateTime(fromDate);
    document.getElementById('toDate').value = formatDateTime(now);
});
