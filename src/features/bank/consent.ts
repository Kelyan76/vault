// Version du texte de consentement : doit correspondre à CONSENT_VERSION dans supabase/functions/bank-connect.
export const CONSENT_VERSION = '2026-10-14';

export const DATA_ACCESSED = [
  'Le nom et le type des comptes que tu choisis d’autoriser',
  'Leur solde, quand ta banque le fournit',
  'Les opérations (date, libellé, montant, devise) des 90 derniers jours, puis les nouvelles',
  'L’état de la connexion (à jour, à renouveler, en erreur)',
];

export const DATA_NOT_ACCESSED = [
  'Tes identifiants et mots de passe bancaires : tu les saisis uniquement chez ta banque',
  'La possibilité de faire des virements ou des paiements',
  'Tes comptes non sélectionnés',
];

export const BENEFITS = [
  { icon: 'sync' as const, text: 'Tes dépenses arrivent toutes seules, plus besoin de tout saisir.' },
  { icon: 'flag' as const, text: 'Certaines quêtes se vérifient automatiquement (ex. moins de livraisons).' },
  { icon: 'vault' as const, text: 'VAULT repère les virements vers ton épargne, que tu confirmes ou non.' },
];
