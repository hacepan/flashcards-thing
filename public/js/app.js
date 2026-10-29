document.addEventListener('alpine:init', () => {
  Alpine.data('flashcardHubApp', () => ({
    // View state
    currentView: 'hub', // 'hub' | 'study' | 'explore'
    loading: true,
    subjects: [],
    currentSubject: null,
    
    // Filters & Search
    searchQuery: '',
    selectedCategory: 'all',

    // Explore / Reference View state
    exploreSearch: '',
    exploreTagFilter: 'all',

    // Study setup modal
    studyModalOpen: false,
    subjectToStudy: null,
    studyLimit: 20,
    studyMode: 'random', // 'random', 'all', 'starred'
    studyTag: 'all',

    // Lightbox modal for images
    lightboxOpen: false,
    lightboxImage: null,
    lightboxTitle: '',

    // Theme (light / dark)
    darkMode: false,

    // Mix in study session
    ...studySession(),

    async init() {
      // Check stored dark mode
      const savedTheme = localStorage.getItem('flashcard_theme');
      if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        this.darkMode = true;
        document.documentElement.classList.add('dark');
      }

      this.initStudy();
      await this.loadSubjects();

      // Browser History (Back / Forward button handling)
      window.addEventListener('popstate', (e) => {
        this.handlePopState(e.state);
      });

      // Escape key for modals & lightbox
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (this.lightboxOpen) {
            this.closeLightbox();
          } else if (this.studyModalOpen) {
            this.studyModalOpen = false;
          }
        }
      });

      // Handle direct URL navigation on initial load (e.g., /study/tgs or /explore/tgs)
      await this.initFromCurrentUrl();
    },

    async initFromCurrentUrl() {
      const path = window.location.pathname;
      if (path.startsWith('/study/')) {
        const sid = path.split('/')[2];
        const sub = this.subjects.find(s => s.id === sid) || { id: sid };
        history.replaceState({ view: 'study', subjectId: sid }, '', path);
        await this.startStudying(sub, null, false);
      } else if (path.startsWith('/explore/')) {
        const sid = path.split('/')[2];
        const sub = this.subjects.find(s => s.id === sid) || { id: sid };
        history.replaceState({ view: 'explore', subjectId: sid }, '', path);
        await this.openExplore(sub, false);
      } else {
        history.replaceState({ view: 'hub' }, '', '/');
      }
    },

    handlePopState(state) {
      if (this.lightboxOpen) {
        this.closeLightbox();
        return;
      }
      if (this.studyModalOpen) {
        this.studyModalOpen = false;
        return;
      }

      const path = window.location.pathname;
      if (path.startsWith('/study/')) {
        const sid = path.split('/')[2];
        const sub = this.subjects.find(s => s.id === sid) || { id: sid };
        this.startStudying(sub, null, false);
      } else if (path.startsWith('/explore/')) {
        const sid = path.split('/')[2];
        const sub = this.subjects.find(s => s.id === sid) || { id: sid };
        this.openExplore(sub, false);
      } else {
        // Return to main menu (Hub)
        this.goToHub(false);
      }
    },

    toggleTheme() {
      this.darkMode = !this.darkMode;
      if (this.darkMode) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('flashcard_theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('flashcard_theme', 'light');
      }
    },

    async loadSubjects() {
      this.loading = true;
      try {
        const res = await fetch('/api/subjects');
        const data = await res.json();
        if (data.success && Array.isArray(data.subjects)) {
          this.subjects = data.subjects;
        } else {
          console.error('Failed to load subjects:', data);
        }
      } catch (err) {
        console.error('Error fetching subjects:', err);
      } finally {
        this.loading = false;
      }
    },

    get categories() {
      const cats = new Set(['all']);
      this.subjects.forEach(s => {
        if (s.category) cats.add(s.category);
      });
      return Array.from(cats);
    },

    get filteredSubjects() {
      return this.subjects.filter(subject => {
        const matchesCategory = this.selectedCategory === 'all' || subject.category === this.selectedCategory;
        const q = this.searchQuery.toLowerCase().trim();
        if (!q) return matchesCategory;

        const matchesTitle = subject.title?.toLowerCase().includes(q);
        const matchesDesc = subject.description?.toLowerCase().includes(q);
        const matchesCategoryText = subject.category?.toLowerCase().includes(q);

        return matchesCategory && (matchesTitle || matchesDesc || matchesCategoryText);
      });
    },

    get totalCardsCount() {
      return this.subjects.reduce((sum, s) => sum + (s.cardCount || 0), 0);
    },

    getSubjectStats(subjectId) {
      const found = this.subjects.find(s => s.id === subjectId);
      if (found && found.lastAccuracy !== null && found.lastAccuracy !== undefined) {
        return { lastAccuracy: Math.round(found.lastAccuracy) };
      }
      try {
        const key = `subject_stats_${subjectId}`;
        const data = localStorage.getItem(key);
        if (!data) return null;
        return JSON.parse(data);
      } catch (e) {
        return null;
      }
    },

    // Navigation & View Actions with Browser History support
    goToHub(updateHistory = true) {
      this.currentView = 'hub';
      this.currentSubject = null;
      if (updateHistory && window.location.pathname !== '/') {
        history.pushState({ view: 'hub' }, '', '/');
      }
      this.loadSubjects();
    },

    handleNavBack() {
      // If we have history inside our app, use browser history.back() to keep history stack clean
      if (window.history.state && window.history.state.view && window.history.state.view !== 'hub') {
        window.history.back();
      } else {
        this.goToHub(true);
      }
    },

    quickStudy(subject) {
      this.startStudying(subject, {
        limit: subject.cardCount > 20 ? 20 : 'all',
        mode: 'random',
        tagFilter: 'all'
      });
    },

    openStudyOptions(subject) {
      this.subjectToStudy = subject;
      this.studyLimit = subject.cardCount > 20 ? 20 : 'all';
      this.studyMode = 'random';
      this.studyTag = 'all';
      this.studyModalOpen = true;
    },

    async startStudying(subject, customOptions = null, updateHistory = true) {
      this.studyModalOpen = false;
      this.loading = true;
      try {
        const res = await fetch(`/api/subjects/${subject.id}`);
        const data = await res.json();
        if (!data.success || !data.subject || !Array.isArray(data.subject.cards)) {
          alert('Error al cargar las tarjetas de esta materia.');
          return;
        }

        this.currentSubject = data.subject;
        this.currentView = 'study';

        if (updateHistory) {
          history.pushState({ view: 'study', subjectId: subject.id }, '', `/study/${subject.id}`);
        }

        const options = customOptions || {
          limit: this.studyLimit,
          mode: this.studyMode,
          tagFilter: this.studyTag
        };

        this.startSession(this.currentSubject.cards, options);
      } catch (err) {
        console.error('Error starting study session:', err);
        alert('Hubo un error de conexión al cargar la materia.');
      } finally {
        this.loading = false;
      }
    },

    async openExplore(subject, updateHistory = true) {
      this.loading = true;
      try {
        const res = await fetch(`/api/subjects/${subject.id}`);
        const data = await res.json();
        if (!data.success || !data.subject) {
          alert('Error al cargar la materia.');
          return;
        }
        this.currentSubject = data.subject;
        this.exploreSearch = '';
        this.exploreTagFilter = 'all';
        this.currentView = 'explore';

        if (updateHistory) {
          history.pushState({ view: 'explore', subjectId: subject.id }, '', `/explore/${subject.id}`);
        }
      } catch (err) {
        console.error('Error opening deck explorer:', err);
      } finally {
        this.loading = false;
      }
    },

    get filteredExploreCards() {
      if (!this.currentSubject || !Array.isArray(this.currentSubject.cards)) return [];
      const q = this.exploreSearch.toLowerCase().trim();

      return this.currentSubject.cards.filter(c => {
        if (!q) return true;
        const conceptMatch = c.concept?.toLowerCase().includes(q);
        const defMatch = c.definition?.toLowerCase().includes(q);
        const hintMatch = c.hint?.toLowerCase().includes(q);
        return conceptMatch || defMatch || hintMatch;
      });
    },

    // Export subject as standalone SQLite (.db) file
    exportSubjectSQLite(subjectId) {
      window.location.href = `/api/subjects/${subjectId}/export-sqlite`;
    },

    // Image Resolver & Lightbox
    resolveImageUrl(url) {
      if (!url) return '';
      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('/')) {
        return url;
      }
      return `/data/${url}`;
    },

    openLightbox(imageUrl, title = '') {
      if (!imageUrl) return;
      this.lightboxImage = this.resolveImageUrl(imageUrl);
      this.lightboxTitle = title || 'Diagrama';
      this.lightboxOpen = true;
    },

    closeLightbox() {
      this.lightboxOpen = false;
      this.lightboxImage = null;
      this.lightboxTitle = '';
    }
  }));
});
