// Point d'entrée. En version web autonome (page publiée), l'adresse de la page n'est pas une route de
// l'appli : on la ramène à « / » avant le démarrage du routeur. Les fichiers sont résolus via <base>.
if (process.env.EXPO_PUBLIC_STANDALONE_WEB === '1' && typeof window !== 'undefined' && window.history) {
  try {
    if (window.location.pathname !== '/') window.history.replaceState(null, '', '/');
  } catch {
    // Adresse non modifiable : le routeur affichera la page introuvable avec un lien vers l'accueil.
  }
}

require('expo-router/entry');
