(() => {
  'use strict';

  const QUESTIONS = Array.isArray(window.QUIZ_QUESTIONS) ? window.QUIZ_QUESTIONS : [];
  const SUBJECTS = {
    all: 'Tutte le materie',
    criminal: 'Procedura penale',
    civil: 'Procedura civile',
    registry: 'Servizi di cancelleria',
    administrative: 'Diritto amministrativo'
  };
  const STORAGE_KEY = 'quiz-progressioni-2026.errors.v1';
  const letters = ['A', 'B', 'C'];
  const state = { subject: 'all', count: 20, session: null, installPrompt: null };

  const $ = (id) => document.getElementById(id);
  const views = { home: $('home-view'), quiz: $('quiz-view'), results: $('results-view') };

  const store = {
    read() {
      try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch (_) { return {}; }
    },
    write(value) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); return true; }
      catch (_) { showToast('Impossibile salvare sul dispositivo. Verifica le impostazioni del browser.'); return false; }
    },
    add(id) {
      const data = this.read();
      const key = String(id);
      const previous = data[key] || {};
      data[key] = { count: Number(previous.count || 0) + 1, lastWrongAt: new Date().toISOString() };
      this.write(data);
    },
    remove(id) {
      const data = this.read();
      delete data[String(id)];
      this.write(data);
    },
    clear() { this.write({}); },
    ids() {
      const valid = new Set(QUESTIONS.map((q) => String(q.id)));
      const data = this.read();
      const ids = Object.keys(data).filter((id) => valid.has(id)).map(Number);
      if (Object.keys(data).length !== ids.length) {
        const clean = {};
        ids.forEach((id) => { clean[id] = data[id]; });
        this.write(clean);
      }
      return ids;
    }
  };

  function shuffle(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const random = new Uint32Array(1);
      if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(random);
      else random[0] = Math.floor(Math.random() * 0xffffffff);
      const j = random[0] % (i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function prepareQuestion(question) {
    const options = shuffle([
      { text: question.correct, correct: true },
      ...question.wrong.map((text) => ({ text, correct: false }))
    ]);
    return { ...question, options };
  }

  function showView(name) {
    Object.entries(views).forEach(([key, element]) => { element.hidden = key !== name; });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showToast(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { toast.hidden = true; }, 3200);
  }

  function setGroupSelection(container, attribute, value) {
    container.querySelectorAll(`[data-${attribute}]`).forEach((button) => {
      const selected = button.dataset[attribute] === String(value);
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-checked', String(selected));
    });
  }

  function renderErrorCount() {
    const count = store.ids().length;
    $('saved-error-count').textContent = String(count);
    $('review-button').disabled = count === 0;
    $('clear-errors-button').hidden = count === 0;
    $('results-review-button').disabled = count === 0;
    $('results-review-button').textContent = count ? `Ripassa gli errori (${count})` : 'Nessun errore da ripassare';
  }

  function startQuiz(mode = 'training') {
    let pool;
    if (mode === 'review') {
      const ids = new Set(store.ids());
      pool = QUESTIONS.filter((question) => ids.has(question.id));
      if (!pool.length) { showToast('Non ci sono errori salvati da ripassare.'); showView('home'); renderErrorCount(); return; }
    } else {
      pool = state.subject === 'all' ? QUESTIONS : QUESTIONS.filter((q) => q.subject === state.subject);
      pool = shuffle(pool).slice(0, Math.min(state.count, pool.length));
    }
    state.session = {
      mode,
      questions: shuffle(pool).map(prepareQuestion),
      index: 0,
      correct: 0,
      answers: []
    };
    $('quiz-mode-label').textContent = mode === 'review' ? 'Ripasso errori' : 'Allenamento';
    showView('quiz');
    renderQuestion();
  }

  function renderQuestion() {
    const session = state.session;
    const question = session.questions[session.index];
    const total = session.questions.length;
    const current = session.index + 1;
    $('progress-label').textContent = `Domanda ${current} di ${total}`;
    $('progress-bar').style.width = `${(current / total) * 100}%`;
    $('subject-label').textContent = SUBJECTS[question.subject];
    $('live-score').textContent = `${session.correct} ${session.correct === 1 ? 'corretta' : 'corrette'}`;
    $('question-number').textContent = `QUESITO ${question.id}`;
    $('question-text').textContent = question.question;
    $('feedback').hidden = true;
    $('feedback').className = 'feedback';
    $('next-button').hidden = true;
    $('next-button').innerHTML = current === total ? 'Vedi risultato <span aria-hidden="true">→</span>' : 'Prossima domanda <span aria-hidden="true">→</span>';

    const list = $('answer-list');
    list.replaceChildren();
    question.options.forEach((option, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'answer-button';
      button.dataset.index = String(index);
      button.setAttribute('aria-label', `${letters[index]}. ${option.text}`);
      const letter = document.createElement('span');
      letter.className = 'answer-letter';
      letter.textContent = letters[index];
      const text = document.createElement('span');
      text.className = 'answer-text';
      text.textContent = option.text;
      const status = document.createElement('span');
      status.className = 'answer-status';
      status.setAttribute('aria-hidden', 'true');
      button.append(letter, text, status);
      button.addEventListener('click', () => answerQuestion(index));
      list.append(button);
    });
    setTimeout(() => list.querySelector('button')?.focus(), 30);
  }

  function answerQuestion(selectedIndex) {
    const session = state.session;
    const question = session.questions[session.index];
    if (!question || session.answers.length > session.index) return;
    const selected = question.options[selectedIndex];
    const correctIndex = question.options.findIndex((option) => option.correct);
    const isCorrect = Boolean(selected.correct);
    if (isCorrect) session.correct += 1;

    session.answers.push({
      id: question.id,
      subject: question.subject,
      question: question.question,
      selected: selected.text,
      correct: question.correct,
      isCorrect
    });

    if (session.mode === 'review') {
      if (isCorrect) store.remove(question.id); else store.add(question.id);
    } else if (!isCorrect) store.add(question.id);

    const buttons = [...$('answer-list').querySelectorAll('.answer-button')];
    buttons.forEach((button, index) => {
      button.disabled = true;
      const status = button.querySelector('.answer-status');
      if (index === correctIndex) { button.classList.add('correct'); status.textContent = '✓'; }
      else if (index === selectedIndex) { button.classList.add('incorrect'); status.textContent = '×'; }
      else button.classList.add('dimmed');
    });

    const feedback = $('feedback');
    feedback.classList.add(isCorrect ? 'success' : 'error');
    const title = document.createElement('strong');
    title.textContent = isCorrect ? 'Risposta corretta' : 'Risposta errata';
    const detail = document.createElement('p');
    detail.textContent = isCorrect ? 'Ottimo, continua così.' : `La risposta corretta è: ${question.correct}`;
    feedback.replaceChildren(title, detail);
    feedback.hidden = false;
    $('live-score').textContent = `${session.correct} ${session.correct === 1 ? 'corretta' : 'corrette'}`;
    $('next-button').hidden = false;
    renderErrorCount();
    $('next-button').focus();
  }

  function nextQuestion() {
    const session = state.session;
    if (!session || session.answers.length <= session.index) return;
    if (session.index < session.questions.length - 1) {
      session.index += 1;
      renderQuestion();
    } else showResults();
  }

  function showResults() {
    const session = state.session;
    const total = session.questions.length;
    const wrong = session.answers.filter((answer) => !answer.isCorrect);
    const percent = Math.round((session.correct / total) * 100);
    $('score-percent').textContent = `${percent}%`;
    $('score-ring').style.setProperty('--score', String(percent));
    $('correct-total').textContent = String(session.correct);
    $('wrong-total').textContent = String(wrong.length);
    $('question-total').textContent = String(total);
    $('result-eyebrow').textContent = session.mode === 'review' ? 'Ripasso completato' : 'Allenamento completato';
    $('results-title').textContent = percent === 100 ? 'Risultato perfetto!' : percent >= 80 ? 'Ottimo risultato' : percent >= 60 ? 'Buon allenamento' : 'Continua ad allenarti';
    $('result-message').textContent = percent === 100
      ? 'Hai risposto correttamente a tutte le domande.'
      : `Hai totalizzato ${session.correct} risposte corrette su ${total}. Gli errori restano disponibili per il ripasso.`;
    $('mistakes-count').textContent = String(wrong.length);
    renderMistakes(wrong);
    $('mistakes-section').hidden = false;
    renderErrorCount();
    showView('results');
  }

  function renderMistakes(wrong) {
    const list = $('mistakes-list');
    list.replaceChildren();
    if (!wrong.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-results';
      empty.innerHTML = '<strong>Nessun errore.</strong><br>Sessione completata senza risposte sbagliate.';
      list.append(empty);
      return;
    }
    wrong.forEach((answer) => {
      const card = document.createElement('article');
      card.className = 'mistake-card';
      const meta = document.createElement('div');
      meta.className = 'mistake-meta';
      meta.innerHTML = `<span>Quesito ${answer.id}</span><span>${SUBJECTS[answer.subject]}</span>`;
      const title = document.createElement('h3');
      title.textContent = answer.question;
      const selected = document.createElement('p');
      selected.className = 'mistake-answer wrong';
      selected.textContent = `La tua risposta: ${answer.selected}`;
      const correct = document.createElement('p');
      correct.className = 'mistake-answer right';
      correct.textContent = `Risposta corretta: ${answer.correct}`;
      card.append(meta, title, selected, correct);
      list.append(card);
    });
  }

  function goHome() {
    state.session = null;
    renderErrorCount();
    showView('home');
  }

  function quitQuiz() {
    if (!state.session || state.session.answers.length === 0 || window.confirm('Vuoi uscire? I progressi della sessione corrente non verranno conteggiati.')) goHome();
  }

  $('subject-options').addEventListener('click', (event) => {
    const button = event.target.closest('[data-subject]');
    if (!button) return;
    state.subject = button.dataset.subject;
    setGroupSelection($('subject-options'), 'subject', state.subject);
  });
  $('count-options').addEventListener('click', (event) => {
    const button = event.target.closest('[data-count]');
    if (!button) return;
    state.count = Number(button.dataset.count);
    setGroupSelection($('count-options'), 'count', state.count);
  });
  $('start-button').addEventListener('click', () => startQuiz('training'));
  $('review-button').addEventListener('click', () => startQuiz('review'));
  $('results-review-button').addEventListener('click', () => startQuiz('review'));
  $('next-button').addEventListener('click', nextQuestion);
  $('quit-button').addEventListener('click', quitQuiz);
  $('new-quiz-button').addEventListener('click', goHome);
  $('brand-home').addEventListener('click', () => views.quiz.hidden ? goHome() : quitQuiz());
  $('clear-errors-button').addEventListener('click', () => {
    if (window.confirm('Vuoi cancellare tutti gli errori salvati su questo dispositivo?')) {
      store.clear(); renderErrorCount(); showToast('Errori salvati cancellati.');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (views.quiz.hidden || !$('next-button').hidden) return;
    const index = ['a', 'b', 'c'].indexOf(event.key.toLowerCase());
    if (index >= 0) $('answer-list').querySelector(`[data-index="${index}"]`)?.click();
  });

  function updateConnection() {
    const offline = !navigator.onLine;
    $('connection-status').hidden = !offline;
    if (offline) $('connection-status').textContent = 'Offline · app disponibile';
  }
  window.addEventListener('online', updateConnection);
  window.addEventListener('offline', updateConnection);

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.installPrompt = event;
    $('install-button').hidden = false;
  });
  $('install-button').addEventListener('click', async () => {
    if (!state.installPrompt) return;
    state.installPrompt.prompt();
    await state.installPrompt.userChoice;
    state.installPrompt = null;
    $('install-button').hidden = true;
  });
  window.addEventListener('appinstalled', () => { $('install-button').hidden = true; showToast('App installata sul dispositivo.'); });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }

  if (QUESTIONS.length !== 180) {
    $('start-button').disabled = true;
    showToast('Banca dati non disponibile o incompleta.');
  }
  renderErrorCount();
  updateConnection();
})();
