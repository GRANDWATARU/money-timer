(() => {
  const STORAGE_KEY = "meetingMeterStaff";
  const MAX = 3;
  const list = document.getElementById("staffList");

  function load() {
    // sessionStorageなのでタブを閉じれば消える＝次に使う人には前の人のデータが残らない
    try {
      const data = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
      return Array.isArray(data) ? data.slice(0, MAX) : [];
    } catch (e) { return []; }
  }

  let staff = load();

  while (staff.length < MAX) {
    staff.push({
      id: crypto.randomUUID(),
      name: "",
      type: "hourly",
      amount: 0
    });
  }

  function render() {
    list.innerHTML = staff.map((m, i) => `
      <div class="staff">
        <strong>スタッフ ${i + 1}</strong>
        <div class="row">
          <input data-index="${i}" data-field="name" value="${escapeHtml(m.name)}" placeholder="スタッフ名">
          <select data-index="${i}" data-field="type">
            <option value="hourly" ${m.type === "hourly" ? "selected" : ""}>1時間金額</option>
            <option value="monthly" ${m.type === "monthly" ? "selected" : ""}>月給</option>
          </select>
          <input type="number" min="0" data-index="${i}" data-field="amount" value="${Number(m.amount) || 0}" placeholder="金額">
        </div>
      </div>
    `).join("");

    list.querySelectorAll("[data-field]").forEach(el => {
      el.addEventListener("input", update);
      el.addEventListener("change", update);
    });
  }

  function update(e) {
    const i = Number(e.target.dataset.index);
    const field = e.target.dataset.field;
    staff[i][field] = field === "amount" ? Number(e.target.value) : e.target.value;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, s => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[s]));
  }

  document.getElementById("saveBtn").addEventListener("click", () => {
    staff = staff.filter(m => m.name.trim() !== "").slice(0, MAX);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(staff));
    try { sessionStorage.setItem("meetingMeterActivity", "1"); } catch (e) {}
    alert("スタッフ情報を保存しました。");
    location.href = "../index.html";
  });

  render();
})();
