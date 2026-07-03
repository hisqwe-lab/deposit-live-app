const STORAGE_KEY = "deposit-live-app-v1";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

const defaults = {
  normalTaxRate: 15.4,
  preferredTaxRate: 9.5,
  deposits: [
    {
      id: crypto.randomUUID(),
      name: "정기예금 A",
      principal: 10000000,
      rate: 3.5,
      termMonths: "12",
      customTermMonths: 12,
      maturityDate: toInputDate(addMonths(new Date(), 12)),
      taxType: "normal",
      inputsHidden: false
    },
    {
      id: crypto.randomUUID(),
      name: "세금우대 예금",
      principal: 5000000,
      rate: 3.8,
      termMonths: "24",
      customTermMonths: 24,
      maturityDate: toInputDate(addMonths(new Date(), 24)),
      taxType: "preferred",
      inputsHidden: false
    }
  ]
};

let state = loadState();
const cardRefs = new Map();

const els = {
  list: document.querySelector("#depositList"),
  template: document.querySelector("#depositTemplate"),
  add: document.querySelector("#addDeposit"),
  normalTaxRate: document.querySelector("#normalTaxRate"),
  preferredTaxRate: document.querySelector("#preferredTaxRate"),
  totalNetEarned: document.querySelector("#totalNetEarned"),
  totalGrossEarned: document.querySelector("#totalGrossEarned"),
  totalNetPerSecond: document.querySelector("#totalNetPerSecond"),
  totalNetAtMaturity: document.querySelector("#totalNetAtMaturity")
};

function addMonths(date, months) {
  const next = new Date(date);
  const originalDay = next.getDate();
  next.setMonth(next.getMonth() + months);
  if (next.getDate() !== originalDay) next.setDate(0);
  return next;
}

function toInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseInputDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.deposits)) {
      return {
        normalTaxRate: Number(saved.normalTaxRate ?? defaults.normalTaxRate),
        preferredTaxRate: Number(saved.preferredTaxRate ?? defaults.preferredTaxRate),
        deposits: saved.deposits.map((deposit) => ({
          ...deposit,
          id: deposit.id || crypto.randomUUID(),
          termMonths: String(deposit.termMonths ?? "12"),
          customTermMonths: Number(deposit.customTermMonths || 12),
          inputsHidden: Boolean(deposit.inputsHidden)
        }))
      };
    }
  } catch (error) {
    console.warn("Saved deposit data could not be loaded.", error);
  }
  return structuredClone(defaults);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatWon(value, maxFractionDigits = 0) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `${safeValue.toLocaleString("ko-KR", { maximumFractionDigits: maxFractionDigits })}원`;
}

function formatPerSecond(value) {
  const digits = Math.abs(value) < 1 ? 3 : 2;
  return `${formatWon(value, digits)}/s`;
}

function getTermMonths(deposit) {
  return deposit.termMonths === "custom"
    ? Math.max(1, Number(deposit.customTermMonths) || 1)
    : Math.max(1, Number(deposit.termMonths) || 1);
}

function getTimeline(deposit) {
  const maturity = parseInputDate(deposit.maturityDate) || addMonths(new Date(), getTermMonths(deposit));
  maturity.setHours(23, 59, 59, 999);
  const start = addMonths(maturity, -getTermMonths(deposit));
  start.setHours(0, 0, 0, 0);
  const totalSeconds = Math.max(1, (maturity - start) / 1000);
  return { start, maturity, totalSeconds };
}

function calculateDeposit(deposit, now = new Date()) {
  const principal = Math.max(0, Number(deposit.principal) || 0);
  const annualRate = Math.max(0, Number(deposit.rate) || 0) / 100;
  const taxRate = (deposit.taxType === "preferred" ? state.preferredTaxRate : state.normalTaxRate) / 100;
  const { start, maturity, totalSeconds } = getTimeline(deposit);
  const elapsedSeconds = Math.min(Math.max(0, (now - start) / 1000), totalSeconds);
  const grossAtMaturity = principal * annualRate * (totalSeconds / SECONDS_PER_YEAR);
  const grossPerSecond = grossAtMaturity / totalSeconds;
  const netPerSecond = grossPerSecond * (1 - taxRate);
  const grossEarned = grossPerSecond * elapsedSeconds;
  const netEarned = netPerSecond * elapsedSeconds;
  const progress = elapsedSeconds / totalSeconds;

  return {
    start,
    grossAtMaturity,
    netAtMaturity: grossAtMaturity * (1 - taxRate),
    grossPerSecond,
    netPerSecond,
    grossEarned,
    netEarned,
    progress
  };
}

function createDeposit() {
  return {
    id: crypto.randomUUID(),
    name: "새 예금",
    principal: 1000000,
    rate: 3,
    termMonths: "12",
    customTermMonths: 12,
    maturityDate: toInputDate(addMonths(new Date(), 12)),
    taxType: "normal",
    inputsHidden: false
  };
}

function render() {
  els.normalTaxRate.value = state.normalTaxRate;
  els.preferredTaxRate.value = state.preferredTaxRate;
  els.list.innerHTML = "";
  cardRefs.clear();

  state.deposits.forEach((deposit) => {
    const fragment = els.template.content.cloneNode(true);
    const card = fragment.querySelector(".deposit-card");
    const customTerm = fragment.querySelector(".custom-term");
    const toggleButton = fragment.querySelector(".toggle-inputs-button");
    card.dataset.id = deposit.id;

    fragment.querySelectorAll("[data-field]").forEach((input) => {
      const field = input.dataset.field;
      input.value = deposit[field] ?? "";
      input.addEventListener("input", () => updateDeposit(deposit.id, field, input.value));
      input.addEventListener("change", () => updateDeposit(deposit.id, field, input.value));
    });

    fragment.querySelector(".delete-button").addEventListener("click", () => {
      state.deposits = state.deposits.filter((item) => item.id !== deposit.id);
      if (state.deposits.length === 0) state.deposits.push(createDeposit());
      saveState();
      render();
    });

    toggleButton.addEventListener("click", () => {
      deposit.inputsHidden = !deposit.inputsHidden;
      updateInputsVisibility(card, toggleButton, deposit.inputsHidden);
      saveState();
    });

    customTerm.hidden = deposit.termMonths !== "custom";
    updateInputsVisibility(card, toggleButton, deposit.inputsHidden);
    cardRefs.set(deposit.id, {
      card,
      toggleButton,
      customTerm,
      grossEarned: fragment.querySelector('[data-live="grossEarned"]'),
      netEarned: fragment.querySelector('[data-live="netEarned"]'),
      grossPerSecond: fragment.querySelector('[data-live="grossPerSecond"]'),
      netPerSecond: fragment.querySelector('[data-live="netPerSecond"]'),
      progressBar: fragment.querySelector('[data-live="progressBar"]'),
      progressText: fragment.querySelector('[data-live="progressText"]'),
      startDate: fragment.querySelector('[data-live="startDate"]'),
      grossAtMaturity: fragment.querySelector('[data-live="grossAtMaturity"]'),
      netAtMaturity: fragment.querySelector('[data-live="netAtMaturity"]')
    });

    els.list.appendChild(fragment);
  });

  updateLiveValues();
}

function updateInputsVisibility(card, button, isHidden) {
  card.classList.toggle("inputs-hidden", isHidden);
  button.setAttribute("aria-label", isHidden ? "입력 보이기" : "입력 숨기기");
  button.title = isHidden ? "입력 보이기" : "입력 숨기기";
}

function updateDeposit(id, field, rawValue) {
  const deposit = state.deposits.find((item) => item.id === id);
  if (!deposit) return;

  if (["principal", "rate", "customTermMonths"].includes(field)) {
    deposit[field] = Number(rawValue);
  } else {
    deposit[field] = rawValue;
  }

  if (field === "termMonths") {
    const refs = cardRefs.get(id);
    if (refs) refs.customTerm.hidden = rawValue !== "custom";
  }

  saveState();
  updateLiveValues();
}

function updateLiveValues() {
  const now = new Date();
  let totalGrossEarned = 0;
  let totalNetEarned = 0;
  let totalNetPerSecond = 0;
  let totalNetAtMaturity = 0;

  state.deposits.forEach((deposit) => {
    const refs = cardRefs.get(deposit.id);
    if (!refs) return;

    const result = calculateDeposit(deposit, now);
    totalGrossEarned += result.grossEarned;
    totalNetEarned += result.netEarned;
    totalNetPerSecond += result.netPerSecond;
    totalNetAtMaturity += result.netAtMaturity;

    refs.grossEarned.textContent = formatWon(result.grossEarned, 2);
    refs.netEarned.textContent = formatWon(result.netEarned, 2);
    refs.grossPerSecond.textContent = formatPerSecond(result.grossPerSecond);
    refs.netPerSecond.textContent = formatPerSecond(result.netPerSecond);
    refs.progressBar.style.width = `${Math.round(result.progress * 1000) / 10}%`;
    refs.progressText.textContent = `${(result.progress * 100).toFixed(2)}% 진행`;
    refs.startDate.textContent = toInputDate(result.start);
    refs.grossAtMaturity.textContent = formatWon(result.grossAtMaturity);
    refs.netAtMaturity.textContent = formatWon(result.netAtMaturity);
  });

  els.totalGrossEarned.textContent = formatWon(totalGrossEarned, 2);
  els.totalNetEarned.textContent = formatWon(totalNetEarned, 2);
  els.totalNetPerSecond.textContent = formatPerSecond(totalNetPerSecond);
  els.totalNetAtMaturity.textContent = formatWon(totalNetAtMaturity);
}

els.add.addEventListener("click", () => {
  state.deposits.unshift(createDeposit());
  saveState();
  render();
});

els.normalTaxRate.addEventListener("input", () => {
  state.normalTaxRate = Math.max(0, Number(els.normalTaxRate.value) || 0);
  saveState();
  updateLiveValues();
});

els.preferredTaxRate.addEventListener("input", () => {
  state.preferredTaxRate = Math.max(0, Number(els.preferredTaxRate.value) || 0);
  saveState();
  updateLiveValues();
});

render();
setInterval(updateLiveValues, 1000);
