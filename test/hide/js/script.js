(() => {
  const STORAGE_KEY = "meetingMeterStaff";
  const MAX_STAFF = 3;
  const FREE_LIMIT_MS = 15 * 60 * 1000; // 無料お試し版は15分まで

  const defaultStaff = [
    { id: crypto.randomUUID(), name: "テスト1", type: "hourly", amount: 10000 },
    { id: crypto.randomUUID(), name: "テスト2", type: "hourly", amount: 20000 },
    { id: crypto.randomUUID(), name: "テスト3", type: "hourly", amount: 30000 }
  ];

  let staff = loadStaff();
  let elapsedMs = 0;
  let running = false;
  let startedAt = 0;
  let timerInterval = null;

  // 各スタッフの「この会議で実際に参加していた時間」を管理します。
  const participants = new Map();

  const timeDisplay = document.getElementById("timeDisplay");
  const costDisplay = document.getElementById("costDisplay");
  const staffForm = document.getElementById("staffForm");
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const resetBtn = document.getElementById("resetBtn");
  const limitModal = document.getElementById("limitModal");
  const modalCloseBtn = document.getElementById("modalCloseBtn");

  const ACTIVITY_KEY = "meetingMeterActivity";
  let skipLeaveConfirm = false;

  function markActivity() {
    try { sessionStorage.setItem(ACTIVITY_KEY, "1"); } catch (e) {}
  }

  function hasActivity() {
    try { return sessionStorage.getItem(ACTIVITY_KEY) === "1"; } catch (e) { return false; }
  }

  window.addEventListener("beforeunload", (e) => {
    if (skipLeaveConfirm || !hasActivity()) return;
    e.preventDefault();
    e.returnValue = "";
  });

  window.meetingMeterBypassLeaveConfirm = () => { skipLeaveConfirm = true; };

  function loadStaff() {
    // sessionStorageなのでタブを閉じれば消える＝次に使う人には前の人のデータが残らない
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
      if (Array.isArray(saved)) return saved.slice(0, MAX_STAFF);
    } catch (e) {}
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(defaultStaff)); } catch (e) {}
    return defaultStaff;
  }

  function hourlyRate(member) {
    const amount = Number(member.amount) || 0;
    if (member.type === "monthly") {
      // 月給は月160時間勤務として時給換算。
      return amount / 160;
    }
    return amount;
  }

  function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
    const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
    const seconds = (totalSeconds % 60).toString().padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
  }

  function renderStaff() {
    staffForm.innerHTML = "";
    staff.forEach(member => {
      const label = document.createElement("label");
      label.innerHTML = `
        <span class="staff-name">${escapeHtml(member.name)}</span>
        <input type="checkbox" value="${member.id}" aria-label="${escapeHtml(member.name)}">
        <span></span>
      `;
      const checkbox = label.querySelector("input");
      checkbox.addEventListener("change", () => toggleParticipant(member.id, checkbox.checked));
      staffForm.appendChild(label);
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, s => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[s]));
  }

  function currentElapsed() {
    return running ? Date.now() - startedAt : elapsedMs;
  }

  function toggleParticipant(id, checked) {
    const nowElapsed = currentElapsed();

    if (checked) {
      participants.set(id, {
        activeSince: running ? nowElapsed : null,
        accumulatedMs: participants.get(id)?.accumulatedMs || 0
      });
    } else {
      const p = participants.get(id);
      if (!p) return;
      if (p.activeSince !== null) {
        p.accumulatedMs += Math.max(0, nowElapsed - p.activeSince);
      }
      p.activeSince = null;
    }
    updateDisplay();
  }

  function getMemberCost(member, p) {
    if (!p) return 0;
    let attendedMs = p.accumulatedMs || 0;
    if (p.activeSince !== null) {
      attendedMs += Math.max(0, currentElapsed() - p.activeSince);
    }
    return (hourlyRate(member) / 3600000) * attendedMs;
  }

  function calculateCost() {
    return staff.reduce((total, member) => {
      return total + getMemberCost(member, participants.get(member.id));
    }, 0);
  }

  function updateDisplay() {
    elapsedMs = currentElapsed();
    if (running && elapsedMs >= FREE_LIMIT_MS) {
      enforceFreeLimit();
      return;
    }
    timeDisplay.textContent = formatTime(elapsedMs);
    costDisplay.textContent = Math.floor(calculateCost()).toLocaleString("ja-JP");
  }

  function showRunningUI() {
    startBtn.style.display = "none";
    stopBtn.style.display = "inline-block";
    resetBtn.style.display = "none";
  }

  function showStoppedUI() {
    startBtn.style.display = "inline-block";
    stopBtn.style.display = "none";
    resetBtn.style.display = "inline-block";
  }

  function showInitialUI() {
    startBtn.style.display = "inline-block";
    stopBtn.style.display = "none";
    resetBtn.style.display = "none";
  }

  function showLimitModal() {
    limitModal.classList.add("show");
  }

  function hideLimitModal() {
    limitModal.classList.remove("show");
  }

  function enforceFreeLimit() {
    elapsedMs = FREE_LIMIT_MS;
    staff.forEach(member => {
      const p = participants.get(member.id);
      if (p && p.activeSince !== null) {
        p.accumulatedMs += Math.max(0, elapsedMs - p.activeSince);
        p.activeSince = elapsedMs;
      }
    });

    clearInterval(timerInterval);
    timerInterval = null;
    running = false;

    timeDisplay.textContent = formatTime(elapsedMs);
    costDisplay.textContent = Math.floor(calculateCost()).toLocaleString("ja-JP");
    showStoppedUI();
    showLimitModal();
  }

  document.getElementById("startBtn").addEventListener("click", () => {
    if (running) return;
    markActivity();

    // スタート時点でチェックされているスタッフは、その時点から参加開始。
    staff.forEach(member => {
      const checkbox = staffForm.querySelector(`input[value="${member.id}"]`);
      if (checkbox?.checked) {
        const p = participants.get(member.id) || { accumulatedMs: 0, activeSince: null };
        if (p.activeSince === null) p.activeSince = elapsedMs;
        participants.set(member.id, p);
      }
    });

    startedAt = Date.now() - elapsedMs;
    running = true;
    timerInterval = setInterval(updateDisplay, 250);
    showRunningUI();
    updateDisplay();
  });

  document.getElementById("stopBtn").addEventListener("click", () => {
    if (!running) return;

    elapsedMs = Date.now() - startedAt;
    staff.forEach(member => {
      const p = participants.get(member.id);
      if (p && p.activeSince !== null) {
        p.accumulatedMs += Math.max(0, elapsedMs - p.activeSince);
        p.activeSince = elapsedMs;
      }
    });

    clearInterval(timerInterval);
    timerInterval = null;
    running = false;
    updateDisplay();
    showStoppedUI();
  });

  resetBtn.addEventListener("click", () => {
    clearInterval(timerInterval);
    timerInterval = null;
    running = false;
    elapsedMs = 0;
    startedAt = 0;
    participants.clear();
    staffForm.querySelectorAll("input[type=checkbox]").forEach(cb => cb.checked = false);
    timeDisplay.textContent = "00:00:00";
    costDisplay.textContent = "0";
    hideLimitModal();
    showInitialUI();
  });

  modalCloseBtn.addEventListener("click", hideLimitModal);

  showInitialUI();
  renderStaff();
  updateDisplay();
})();
