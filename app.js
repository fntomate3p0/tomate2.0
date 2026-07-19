// À modifier à chaque nouvelle version publiée
// Exemple : si tu publies une nouvelle version, mets 1.0.3, puis 1.0.4, 1.0.5, etc.
const latestVersion = '1.0.1'; // Version de l'APK mobile
const latestPcVersion = '1.0.1'; // Version du fichier complet PC
const apkUrl = 'https://drive.google.com/uc?export=download&id=12ZzHykmn2wNlu-_79umMxXAZ-t0juR2k';
const installedVersionKey = 'installedVersion';
const lastSeenVersionKey = 'lastSeenVersion';
const pcInstalledVersionKey = 'pcInstalledVersion';
const pcLastSeenVersionKey = 'pcLastSeenVersion';
const reviewsStorageKey = 'gameReviews';
const deviceIdStorageKey = 'gameDeviceId';
const reviewsCollectionName = 'reviews';

const versionLabel = document.getElementById('versionLabel');
const downloadBtn = document.getElementById('downloadBtn');
const updatePanel = document.getElementById('updatePanel');
const updateMessage = document.getElementById('updateMessage');
const updateLink = document.getElementById('updateLink');
const pcVersionLabel = document.getElementById('pcVersionLabel');
const pcDownloadBtn = document.getElementById('pcDownloadBtn');
const pcUpdatePanel = document.getElementById('pcUpdatePanel');
const pcUpdateMessage = document.getElementById('pcUpdateMessage');
const pcUpdateLink = document.getElementById('pcUpdateLink');
const reviewForm = document.getElementById('reviewForm');
const reviewNameInput = document.getElementById('reviewName');
const reviewRatingInput = document.getElementById('reviewRating');
const reviewCommentInput = document.getElementById('reviewComment');
const averageStars = document.getElementById('averageStars');
const reviewCount = document.getElementById('reviewCount');
const reviewMessage = document.getElementById('reviewMessage');
const reviewList = document.getElementById('reviewList');

function setVersionText(text) {
  if (versionLabel) versionLabel.textContent = text;
}

function getStoredVersion() {
  return localStorage.getItem(installedVersionKey);
}

function saveInstalledVersion(version) {
  localStorage.setItem(installedVersionKey, version);
}

function saveLastSeenVersion(version) {
  localStorage.setItem(lastSeenVersionKey, version);
}

function getStoredPcVersion() {
  return localStorage.getItem(pcInstalledVersionKey);
}

function saveInstalledPcVersion(version) {
  localStorage.setItem(pcInstalledVersionKey, version);
}

function saveLastSeenPcVersion(version) {
  localStorage.setItem(pcLastSeenVersionKey, version);
}

function getDeviceId() {
  let deviceId = localStorage.getItem(deviceIdStorageKey);

  if (!deviceId) {
    deviceId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(deviceIdStorageKey, deviceId);
  }

  return deviceId;
}

function getStoredReviews() {
  try {
    const stored = localStorage.getItem(reviewsStorageKey);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Erreur lors de la lecture des avis locaux :', error);
    return [];
  }
}

function saveStoredReviews(reviews) {
  localStorage.setItem(reviewsStorageKey, JSON.stringify(reviews));
}

function normalizeReviews(reviews) {
  const byDevice = new Map();

  reviews
    .filter(Boolean)
    .forEach((review) => {
      const normalizedReview = {
        ...review,
        rating: String(review.rating || '5')
      };
      const deviceKey = normalizedReview.deviceId || normalizedReview.id || 'default';

      if (!byDevice.has(deviceKey)) {
        byDevice.set(deviceKey, normalizedReview);
        return;
      }

      const existingReview = byDevice.get(deviceKey);
      const existingDate = new Date(existingReview.createdAt || 0).getTime();
      const newDate = new Date(normalizedReview.createdAt || 0).getTime();

      if (newDate >= existingDate) {
        byDevice.set(deviceKey, normalizedReview);
      }
    });

  return Array.from(byDevice.values()).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function mergeReviews(localReviews, remoteReviews) {
  const merged = new Map();

  [...localReviews, ...remoteReviews].forEach((review) => {
    const key = review.id || `${review.deviceId || 'device'}:${review.createdAt || Date.now()}`;
    if (!merged.has(key)) {
      merged.set(key, review);
    }
  });

  return normalizeReviews(Array.from(merged.values()));
}

async function getReviews() {
  const localReviews = normalizeReviews(getStoredReviews());

  try {
    const firestore = window.firebaseFirestore;
    if (firestore && window.firebaseDb) {
      const q = firestore.query(
        firestore.collection(window.firebaseDb, reviewsCollectionName),
        firestore.orderBy('createdAt', 'desc')
      );
      const snapshot = await firestore.getDocs(q);
      const remoteReviews = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const mergedReviews = mergeReviews(localReviews, remoteReviews);
      saveStoredReviews(mergedReviews);
      return mergedReviews;
    }
  } catch (error) {
    console.error('Erreur lors de la lecture des avis :', error);
  }

  return localReviews;
}

async function saveReviews(review) {
  const reviewWithMeta = {
    ...review,
    createdAt: review.createdAt || new Date().toISOString()
  };

  const localReviews = normalizeReviews(getStoredReviews());
  const existingIndex = localReviews.findIndex((item) => item.deviceId === reviewWithMeta.deviceId);
  const nextReviews = [...localReviews];

  if (existingIndex >= 0) {
    nextReviews[existingIndex] = reviewWithMeta;
  } else {
    nextReviews.unshift(reviewWithMeta);
  }

  saveStoredReviews(nextReviews);

  try {
    const firestore = window.firebaseFirestore;
    if (!firestore || !window.firebaseDb) {
      return true;
    }

    const existingReviewsQuery = firestore.query(
      firestore.collection(window.firebaseDb, reviewsCollectionName),
      firestore.where('deviceId', '==', reviewWithMeta.deviceId)
    );
    const snapshot = await firestore.getDocs(existingReviewsQuery);

    if (!snapshot.empty) {
      const existingDoc = snapshot.docs[0];
      await firestore.updateDoc(
        firestore.doc(window.firebaseDb, reviewsCollectionName, existingDoc.id),
        {
          ...reviewWithMeta,
          createdAt: reviewWithMeta.createdAt
        }
      );
    } else {
      await firestore.addDoc(
        firestore.collection(window.firebaseDb, reviewsCollectionName),
        {
          ...reviewWithMeta,
          createdAt: reviewWithMeta.createdAt
        }
      );
    }

    return true;
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement de l\'avis :', error);

    if (error?.code === 'permission-denied') {
      showReviewMessage('Avis enregistré localement. Firebase refuse l\'écriture, mais ton avis reste visible sur cet appareil.', true);
    } else {
      showReviewMessage('Avis enregistré localement. La synchronisation Firebase a échoué.', true);
    }

    return true;
  }
}

async function prefillReviewForm() {
  const reviews = await getReviews();
  const existingReview = reviews.find((review) => review.deviceId === getDeviceId());

  if (existingReview && reviewNameInput) {
    reviewNameInput.value = existingReview.name;
    reviewCommentInput.value = existingReview.comment;
    if (reviewRatingInput) {
      reviewRatingInput.value = existingReview.rating;
    }
  }
}

async function renderReviews() {
  const reviews = await getReviews();
  const total = reviews.length;
  const average = total
    ? (reviews.reduce((sum, review) => sum + Number(review.rating), 0) / total).toFixed(1)
    : '0.0';

  if (averageStars) {
    const rounded = Math.round(Number(average));
    const filledStars = '★'.repeat(rounded);
    const emptyStars = '☆'.repeat(5 - rounded);
    averageStars.innerHTML = `Moyenne : <strong>${average}</strong> / 5 <span class="stars">${filledStars}${emptyStars}</span>`;
  }

  if (reviewCount) {
    reviewCount.textContent = `${total} avis`;
  }

  if (reviewList) {
    if (!reviews.length) {
      reviewList.innerHTML = '<p class="empty-state">Aucun avis pour le moment.</p>';
      return;
    }

    reviewList.innerHTML = reviews
      .map((review) => {
        const stars = '★'.repeat(Number(review.rating)) + '☆'.repeat(5 - Number(review.rating));
        return `
          <article class="review-item">
            <strong>${review.name}</strong>
            <div class="stars">${stars}</div>
            <p>${review.comment}</p>
          </article>
        `;
      })
      .join('');
  }
}

function showReviewMessage(message, isSuccess = true) {
  if (reviewMessage) {
    reviewMessage.textContent = message;
    reviewMessage.style.color = isSuccess ? '#86efac' : '#fda4af';
  }
}

async function handleReviewSubmit(event) {
  event.preventDefault();

  if (!reviewNameInput || !reviewCommentInput) {
    return;
  }

  const name = reviewNameInput.value.trim();
  const comment = reviewCommentInput.value.trim();
  const rating = reviewRatingInput ? reviewRatingInput.value : '5';

  if (!name || !comment) {
    showReviewMessage('Remplis ton nom et ton commentaire.', false);
    return;
  }

  showReviewMessage('Envoi en cours...', true);
  const deviceId = getDeviceId();
  const saved = await saveReviews({ deviceId, name, rating, comment });

  if (saved) {
    showReviewMessage('Merci pour ton avis !', true);
    await renderReviews();
  } else {
    showReviewMessage('Une erreur est survenue. Réessaie.', false);
  }
}

function showUpdateNotice() {
  if (updatePanel) {
    updatePanel.classList.remove('hidden');
  }
  if (updateMessage) {
    updateMessage.textContent = `Une nouvelle mise à jour (${latestVersion}) est disponible. Téléchargez la dernière version pour profiter des nouveaux contenus et correctifs.`;
  }
  if (updateLink && !updateLink.getAttribute('data-custom-url')) {
    updateLink.href = apkUrl;
  }
}

function showPcUpdateNotice() {
  if (pcUpdatePanel) {
    pcUpdatePanel.classList.remove('hidden');
  }
  if (pcUpdateMessage) {
    pcUpdateMessage.textContent = `Une nouvelle mise à jour (${latestPcVersion}) est disponible pour le jeu PC. Télécharge la dernière version pour profiter des derniers contenus et correctifs.`;
  }
  if (pcUpdateLink) {
    pcUpdateLink.href = pcFileUrl;
  }
}

function checkForUpdate() {
  const savedVersion = getStoredVersion();

  if (!savedVersion) {
    saveInstalledVersion(latestVersion);
    saveLastSeenVersion(latestVersion);
    setVersionText(`Version actuelle : ${latestVersion}`);
    return;
  }

  setVersionText(`Version actuelle : ${savedVersion}`);

  if (savedVersion !== latestVersion) {
    showUpdateNotice();
    saveLastSeenVersion(latestVersion);
  }
}

function checkForPcUpdate() {
  const savedPcVersion = getStoredPcVersion();

  if (!savedPcVersion) {
    saveInstalledPcVersion(latestPcVersion);
    saveLastSeenPcVersion(latestPcVersion);
    if (pcVersionLabel) {
      pcVersionLabel.textContent = `Version complète : ${latestPcVersion}`;
    }
    return;
  }

  if (pcVersionLabel) {
    pcVersionLabel.textContent = `Version complète : ${savedPcVersion}`;
  }

  if (savedPcVersion !== latestPcVersion) {
    showPcUpdateNotice();
    saveLastSeenPcVersion(latestPcVersion);
  }
}

if (downloadBtn && !downloadBtn.getAttribute('data-custom-url')) {
  downloadBtn.href = apkUrl;
}

if (updateLink && !updateLink.getAttribute('data-custom-url')) {
  updateLink.href = apkUrl;
}

if (pcDownloadBtn) {
  pcDownloadBtn.href = pcFileUrl;
}

if (pcUpdateLink) {
  pcUpdateLink.href = pcFileUrl;
}

if (reviewForm) {
  reviewForm.addEventListener('submit', handleReviewSubmit);
}

setVersionText(`Version actuelle : ${latestVersion}`);
saveInstalledVersion(latestVersion);
saveInstalledPcVersion(latestPcVersion);
checkForUpdate();
checkForPcUpdate();
prefillReviewForm();
renderReviews();
