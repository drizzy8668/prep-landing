// ============================================================
// PREP.UZ landing v2 — multi-step form + interactions
// ============================================================

document.addEventListener('DOMContentLoaded', () => {

  /* ---------- "Open form" buttons ---------- */
  document.querySelectorAll('[data-open-form]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('lead-form').scrollIntoView({ behavior: 'smooth' });
    });
  });

  /* ---------- Mobile sticky CTA: hide once form is visible ---------- */
  const mobileCta = document.getElementById('mobileCta');
  const leadFormSection = document.getElementById('lead-form');
  if (mobileCta && leadFormSection && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => { mobileCta.style.display = entry.isIntersecting ? 'none' : ''; });
    }, { threshold: 0.15 });
    io.observe(leadFormSection);
  }

  /* ---------- Testimonials carousel ---------- */
  const reviewGrid = document.getElementById('reviewGrid');
  const prevBtn = document.querySelector('[data-carousel-prev]');
  const nextBtn = document.querySelector('[data-carousel-next]');
  if (reviewGrid && prevBtn && nextBtn) {
    const scrollStep = () => (reviewGrid.querySelector('.review-card')?.offsetWidth || 200) + 16;
    prevBtn.addEventListener('click', () => reviewGrid.scrollBy({ left: -scrollStep(), behavior: 'smooth' }));
    nextBtn.addEventListener('click', () => reviewGrid.scrollBy({ left: scrollStep(), behavior: 'smooth' }));
  }

  /* ---------- Countdown timer (soft urgency nudge, mirrors the proven funnel) ----------
     SARDOR: change TIMER_SECONDS or remove the timer-row from index.html
     if you'd rather not show a countdown at all. */
  const TIMER_SECONDS = 3 * 60;
  let secondsLeft = TIMER_SECONDS;
  const timerEl = document.getElementById('timer');
  if (timerEl) {
    const tick = () => {
      const m = Math.floor(secondsLeft / 60);
      const s = secondsLeft % 60;
      timerEl.textContent = `${m}:${s.toString().padStart(2, '0')}`;
      if (secondsLeft > 0) { secondsLeft--; setTimeout(tick, 1000); }
    };
    tick();
  }

  /* ---------- Multi-step form ---------- */
  const form = document.getElementById('leadForm');
  if (!form) return;

  const steps = Array.from(form.querySelectorAll('.step'));
  const totalSteps = steps.length;
  let currentStep = 1;
  const selectedGoals = new Set();

  const progressFill = document.getElementById('progressFill');
  const progressLabel = document.getElementById('progressLabel');

  function renderProgress() {
    progressFill.style.width = `${(currentStep / totalSteps) * 100}%`;
    progressLabel.textContent = `${currentStep} / ${totalSteps}`;
  }

  function showStep(n) {
    steps.forEach(s => s.classList.toggle('is-active', Number(s.dataset.step) === n));
    currentStep = n;
    renderProgress();
    const activeStep = steps.find(s => Number(s.dataset.step) === n);
    const firstInput = activeStep.querySelector('input, select');
    if (firstInput) setTimeout(() => firstInput.focus({ preventScroll: true }), 50);
  }

  function setError(field, show) {
    field.closest('.field').classList.toggle('has-error', show);
  }

  function validateStep(n) {
    if (n === 1) {
      const el = document.getElementById('nameField');
      const ok = el.value.trim().length >= 2;
      setError(el, !ok);
      return ok;
    }
    if (n === 2) {
      const el = document.getElementById('phoneField');
      const digits = el.value.replace(/\D/g, '');
      const ok = digits.length === 12; // 998 + 9 digits
      setError(el, !ok);
      return ok;
    }
    if (n === 3) {
      const errorEl = document.getElementById('goalError');
      const ok = selectedGoals.size > 0;
      errorEl.closest('.field').classList.toggle('has-error', !ok);
      return ok;
    }
    if (n === 4) {
      const el = document.getElementById('regionField');
      const ok = el.value !== '';
      setError(el, !ok);
      return ok;
    }
    if (n === 5) {
      const el = document.getElementById('ageField');
      const val = Number(el.value);
      const ok = val >= 5 && val <= 99;
      setError(el, !ok);
      return ok;
    }
    return true;
  }

  form.querySelectorAll('[data-next]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!validateStep(currentStep)) return;
      if (currentStep < totalSteps) showStep(currentStep + 1);
    });
  });
  form.querySelectorAll('[data-prev]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (currentStep > 1) showStep(currentStep - 1);
    });
  });

  /* ---------- Goal chips (multi-select) ---------- */
  document.querySelectorAll('.goal-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const goal = chip.dataset.goal;
      if (selectedGoals.has(goal)) {
        selectedGoals.delete(goal);
        chip.classList.remove('is-selected');
      } else {
        selectedGoals.add(goal);
        chip.classList.add('is-selected');
      }
      document.getElementById('goalError').closest('.field').classList.remove('has-error');
    });
  });

  /* ---------- Phone mask ---------- */
  const phoneField = document.getElementById('phoneField');
  if (phoneField) {
    phoneField.addEventListener('focus', () => { if (!phoneField.value) phoneField.value = '+998 '; });
    phoneField.addEventListener('input', () => {
      let digits = phoneField.value.replace(/\D/g, '');
      if (digits.startsWith('998')) digits = digits.slice(3);
      digits = digits.slice(0, 9);
      let formatted = '+998';
      if (digits.length > 0) formatted += ' ' + digits.slice(0, 2);
      if (digits.length > 2) formatted += ' ' + digits.slice(2, 5);
      if (digits.length > 5) formatted += ' ' + digits.slice(5, 7);
      if (digits.length > 7) formatted += ' ' + digits.slice(7, 9);
      phoneField.value = formatted;
    });
  }

  /* ---------- Submit ---------- */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateStep(5)) return;

    // Honeypot
    if (document.getElementById('companyField').value) return;

    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Yuborilmoqda...';

    const params = new URLSearchParams(window.location.search);
    const payload = {
      name: document.getElementById('nameField').value.trim(),
      phone: document.getElementById('phoneField').value.replace(/\s/g, ''),
      goals: Array.from(selectedGoals),
      region: document.getElementById('regionField').value,
      age: document.getElementById('ageField').value,
      source: 'landing_prep_uz_v2',
      utm_source: params.get('utm_source') || '',
      utm_medium: params.get('utm_medium') || '',
      utm_campaign: params.get('utm_campaign') || '',
      utm_content: params.get('utm_content') || '',
      utm_term: params.get('utm_term') || '',
      fbclid: params.get('fbclid') || '',
      yclid: params.get('yclid') || '',
      gclid: params.get('gclid') || '',
      page_url: window.location.href,
    };

    try {
      const res = await fetch('/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Lead submit failed: ' + res.status);

      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: 'lead_submit', lead_source: payload.utm_source || 'direct' });
      // if (typeof fbq === 'function') fbq('track', 'Lead');

      form.hidden = true;
      document.getElementById('formSuccess').hidden = false;
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Yuborish';
      alert("Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring yoki telefon orqali bog'laning.");
      console.error(err);
    }
  });

  renderProgress();
});
