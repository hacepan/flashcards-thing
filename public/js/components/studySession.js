// Flashcard Study Session Engine for Alpine.js
function studySession() {
  return {
    deck: [],
    currentIndex: 0,
    currentCard: null,
    isFlipped: false,
    showConceptFirst: false,
    score: 0,
    isComplete: false,
    missedCards: [],
    reviewedCards: [],
    starredCardIds: new Set(),
    sessionConfig: {
      limit: 20,
      mode: 'random',
      tagFilter: 'all'
    },
    keyHandlerBound: null,

    initStudy() {
      this.loadStarred();
      this.setupKeyboard();
    },

    setupKeyboard() {
      if (this.keyHandlerBound) {
        window.removeEventListener('keydown', this.keyHandlerBound);
      }

      this.keyHandlerBound = (e) => {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
        if (this.lightboxOpen || this.studyModalOpen || this.importModalOpen) return;
        if (this.currentView !== 'study') return;

        if (e.code === 'Space') {
          e.preventDefault();
          this.toggleFlip();
        } else if (e.code === 'ArrowLeft' || e.key === '1') {
          if (this.isFlipped && !this.isComplete) {
            e.preventDefault();
            this.answer(false);
          }
        } else if (e.code === 'ArrowRight' || e.key === '2') {
          if (this.isFlipped && !this.isComplete) {
            e.preventDefault();
            this.answer(true);
          }
        } else if (e.key === 's' || e.key === 'S') {
          e.preventDefault();
          this.toggleStarCurrent();
        } else if (e.code === 'Backspace' || e.key === 'p' || e.key === 'P') {
          if (this.canGoPrevious()) {
            e.preventDefault();
            this.previousCard();
          }
        }
      };

      window.addEventListener('keydown', this.keyHandlerBound);
    },

    loadStarred() {
      try {
        const key = `flashcards_starred_${this.currentSubject?.id || 'default'}`;
        const stored = JSON.parse(localStorage.getItem(key) || '[]');
        this.starredCardIds = new Set(stored);
      } catch (e) {
        this.starredCardIds = new Set();
      }
    },

    saveStarred() {
      try {
        const key = `flashcards_starred_${this.currentSubject?.id || 'default'}`;
        localStorage.setItem(key, JSON.stringify(Array.from(this.starredCardIds)));
      } catch (e) {
        console.error('Error saving starred cards:', e);
      }
    },

    isCardStarred(cardId) {
      if (!cardId) return false;
      return this.starredCardIds.has(String(cardId));
    },

    async toggleStarCurrent() {
      const card = this.getActiveCard();
      if (!card) return;
      const cid = String(card.id);

      if (this.starredCardIds.has(cid)) {
        this.starredCardIds.delete(cid);
        card.isStarred = false;
      } else {
        this.starredCardIds.add(cid);
        card.isStarred = true;
      }
      this.saveStarred();

      // Also persist to SQLite backend
      try {
        await fetch(`/api/cards/${card.id}/star`, { method: 'POST' });
      } catch (e) {
        // local storage fallback
      }
    },

    // Get current active card reliably
    getActiveCard() {
      if (this.deck && this.deck.length > 0 && this.currentIndex < this.deck.length) {
        return this.deck[this.currentIndex];
      }
      return this.currentCard || null;
    },

    updateActiveCard() {
      this.currentCard = this.getActiveCard();
    },

    // Card face text helper
    getCardFaceText(face) {
      const card = this.getActiveCard();
      if (!card) return '';
      if (face === 'front') {
        return this.showConceptFirst ? card.concept : card.definition;
      } else {
        return this.showConceptFirst ? card.definition : card.concept;
      }
    },

    getCardFaceLabel(face) {
      if (face === 'front') {
        return this.showConceptFirst ? 'Concepto' : 'Definición';
      } else {
        return this.showConceptFirst ? 'Definición' : 'Concepto';
      }
    },

    getCurrentTags() {
      const card = this.getActiveCard();
      return (card && Array.isArray(card.tags)) ? card.tags : [];
    },

    getCurrentHint() {
      const card = this.getActiveCard();
      return card?.hint || '';
    },

    getCurrentImage() {
      const card = this.getActiveCard();
      return card?.image || null;
    },

    getCurrentImagePosition() {
      const card = this.getActiveCard();
      return card?.imagePosition || card?.image_position || 'back';
    },

    getProgressPercent() {
      if (!this.deck || this.deck.length === 0) return 0;
      return Math.round(((this.currentIndex) / this.deck.length) * 100);
    },

    getAccuracyPercent() {
      if (!this.deck || this.deck.length === 0) return 0;
      return Math.round((this.score / this.deck.length) * 100);
    },

    startSession(cards, options = {}) {
      if (!cards || cards.length === 0) {
        alert('No se encontraron tarjetas en esta materia.');
        return;
      }

      const {
        limit = 20,
        mode = 'random',
        tagFilter = 'all',
        customCards = null
      } = options;

      this.sessionConfig = { limit, mode, tagFilter };
      this.loadStarred();

      let pool = customCards ? [...customCards] : [...cards];

      // Tag filter
      if (tagFilter && tagFilter !== 'all') {
        pool = pool.filter(c => Array.isArray(c.tags) && c.tags.includes(tagFilter));
      }

      // Mode filter
      if (mode === 'starred') {
        pool = pool.filter(c => this.starredCardIds.has(String(c.id)) || c.isStarred);
      }

      if (pool.length === 0) {
        alert('No hay tarjetas disponibles para el filtro seleccionado.');
        return;
      }

      // Shuffle if random
      if (mode === 'random' || mode === 'starred') {
        pool = [...pool].sort(() => Math.random() - 0.5);
      }

      // Apply limit
      if (limit !== 'all' && typeof limit === 'number' && limit > 0) {
        this.deck = pool.slice(0, limit);
      } else {
        this.deck = pool;
      }

      this.currentIndex = 0;
      this.score = 0;
      this.isFlipped = false;
      this.isComplete = false;
      this.missedCards = [];
      this.reviewedCards = [];
      this.updateActiveCard();

      console.log(`Study session started: ${this.deck.length} cards loaded. First card:`, this.currentCard?.concept);
    },

    toggleFlip() {
      if (this.isComplete) return;
      this.isFlipped = !this.isFlipped;
    },

    canGoPrevious() {
      return this.currentIndex > 0 && !this.isComplete;
    },

    previousCard() {
      if (!this.canGoPrevious()) return;
      this.currentIndex--;
      this.updateActiveCard();
      this.isFlipped = false;

      const last = this.reviewedCards.pop();
      if (last) {
        if (last.isCorrect) {
          this.score = Math.max(0, this.score - 1);
        } else {
          const lastMissed = this.missedCards[this.missedCards.length - 1];
          if (lastMissed && String(lastMissed.id) === String(last.id)) {
            this.missedCards.pop();
          }
        }
      }
    },

    answer(isCorrect) {
      if (!this.isFlipped || this.isComplete) return;

      const current = this.getActiveCard();
      if (!current) return;

      this.reviewedCards.push({ id: current.id, isCorrect });

      if (isCorrect) {
        this.score++;
      } else {
        this.missedCards.push(current);
      }

      this.isFlipped = false;

      setTimeout(() => {
        if (this.currentIndex + 1 < this.deck.length) {
          this.currentIndex++;
          this.updateActiveCard();
        } else {
          this.finishQuiz();
        }
      }, 160);
    },

    async finishQuiz() {
      this.isComplete = true;
      const acc = this.getAccuracyPercent();

      // Persist to SQLite backend
      if (this.currentSubject) {
        try {
          await fetch('/api/study/record', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              subjectId: this.currentSubject.id,
              cardsStudied: this.deck.length,
              score: this.score,
              accuracy: acc,
              cardReviews: this.reviewedCards
            })
          });
        } catch (e) {
          console.error('Error saving study record to SQLite:', e);
        }

        // Also update local storage for instant dashboard updates
        try {
          const statsKey = `subject_stats_${this.currentSubject.id}`;
          const currentStats = JSON.parse(localStorage.getItem(statsKey) || '{"sessions":0,"totalAnswered":0,"totalCorrect":0}');
          currentStats.sessions += 1;
          currentStats.totalAnswered += this.deck.length;
          currentStats.totalCorrect += this.score;
          currentStats.lastAccuracy = acc;
          localStorage.setItem(statsKey, JSON.stringify(currentStats));
        } catch (e) {}
      }
    },

    restartFull() {
      this.startSession(this.currentSubject?.cards || [], this.sessionConfig);
    },

    reviewMissedOnly() {
      if (this.missedCards.length === 0) return;
      const missedToReview = [...this.missedCards];
      this.startSession(missedToReview, {
        limit: 'all',
        mode: 'missed',
        customCards: missedToReview
      });
    }
  };
}
