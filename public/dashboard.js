window.addEventListener('DOMContentLoaded', () => {
  const rawUser = localStorage.getItem('user');
  const token = localStorage.getItem('token');
  const user = rawUser ? JSON.parse(rawUser) : null;

  if (!user || !token) {
    alert("⚠️ Session expired or not logged in. Redirecting...");
    window.location.href = "login.html";
  } else {
    const header = document.querySelector("header");
    if (header) {
      header.textContent = `Welcome, ${user.username}`;
    }

    checkUnreadNotifications();
    lockJoinCardOutsideTime(); // visual locking
  }

  const contactBtn = document.querySelector('#contact-us');
  if (contactBtn) {
    contactBtn.addEventListener('click', function (event) {
      event.preventDefault();
      alert("In case of any issue/ query/ complaint/ or suggestions, please contact 9815939797 (whatsapp or text message only)");
    });
  }
});

function isJoinTimeAllowed() {
  const now = new Date();
  const hour = now.getHours();
  return hour >= 16 && hour < 23; // 4 PM to before 11 PM
}

function lockJoinCardOutsideTime() {
  const joinCard = document.getElementById("join-card");
  if (!isJoinTimeAllowed() && joinCard) {
    joinCard.classList.add("locked");
  }
}

function goTo(page) {
  if (page === 'join-tournament' && !isJoinTimeAllowed()) {
    alert("⏳ Joining is only available between 4 PM and 11 PM.");
    return;
  }
  window.location.href = page + '.html';
}

function handleUnauthorized(status) {
  if (status === 401) {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    alert('Session expired. Please log in again.');
    window.location.href = 'login.html';
    return true;
  }
  return false;
}

async function checkUnreadNotifications() {
  const token = localStorage.getItem('token');
  if (!token) return;

  try {
    const res = await fetch('https://website-backend-server.onrender.com/api/notifications/unread-count', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (handleUnauthorized(res.status)) return;

    const data = await res.json();
    const title = document.querySelector('#notifications-card h3');

    if (data.success && data.count > 0) {
      if (title && !title.textContent.includes('🔔')) {
        title.textContent = 'Notifications 🔔';
      }
    } else if (title) {
      title.textContent = 'Notifications';
    }

  } catch (err) {
    console.warn('[dashboard] Notification check failed:', err.message);
  }
}