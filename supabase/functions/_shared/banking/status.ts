import type { ConnectionStatus } from './types.ts';

/**
 * Bridge v3 — champ `status` d'un item (docs.bridgeapi.io/docs/items-status, consulté le 2026-10-14) :
 * 0 ok ; -2 premier rafraîchissement en cours ; -3 rafraîchissement après mise à jour des identifiants ;
 * 402 identifiants erronés ; 429 action requise dans la banque en ligne ; 1003 rafraîchissement échoué (réessayer) ;
 * 1005 compte non pris en charge ; 1007 rafraîchissement temporairement désactivé ; 1009 solde modifié sans nouvelle
 * opération (normal) ; 1010 MFA/OTP requis ; 1099 migration en cours ; 1100 comptes pro à valider.
 */
export function bridgeItemStatus(status: number, authenticationExpiresAt: string | null, now: Date): ConnectionStatus {
  if (authenticationExpiresAt && new Date(authenticationExpiresAt).getTime() <= now.getTime()) return 'consent_expired';
  switch (status) {
    case 0:
    case 1009:
      return 'connected';
    case -2:
    case -3:
    case 1099:
      return 'syncing';
    case 402:
    case 429:
    case 1010:
    case 1100:
      return 'action_required';
    case 1003:
    case 1005:
    case 1007:
    default:
      return 'sync_error';
  }
}

/**
 * Powens — champ `state` d'une connexion (docs.powens.com, guide « SCA & connection states ») :
 * null = synchronisation réussie ; SCARequired / webauthRequired = consentement ou SCA à renouveler ;
 * additionalInformationNeeded, decoupled, validating, actionNeeded, passwordExpired, wrongpass = action utilisateur ;
 * rateLimiting, websiteUnavailable, bug = erreur temporaire, reprise automatique.
 */
export function powensConnectionState(state: string | null): ConnectionStatus {
  switch (state) {
    case null:
      return 'connected';
    case 'SCARequired':
    case 'webauthRequired':
      return 'consent_expired';
    case 'validating':
    case 'decoupled':
    case 'additionalInformationNeeded':
    case 'actionNeeded':
    case 'passwordExpired':
    case 'wrongpass':
      return 'action_required';
    default:
      return 'sync_error';
  }
}

export interface StatusCopy {
  title: string;
  explanation: string;
  action: string | null;
  tone: 'neutral' | 'progress' | 'success' | 'warning' | 'alert';
}

export const STATUS_COPY: Record<ConnectionStatus, StatusCopy> = {
  not_connected: { title: 'Non connectée', explanation: 'Aucune banque n’est reliée à VAULT.', action: 'Connecter ma banque', tone: 'neutral' },
  pending_authorization: { title: 'En attente d’autorisation', explanation: 'Termine le parcours sécurisé ouvert chez le prestataire.', action: 'Reprendre', tone: 'progress' },
  connected: { title: 'Connectée', explanation: 'Les comptes autorisés se synchronisent automatiquement.', action: null, tone: 'success' },
  syncing: { title: 'Synchronisation en cours', explanation: 'Les opérations arrivent, cela peut prendre quelques minutes.', action: null, tone: 'progress' },
  consent_expired: { title: 'Consentement expiré', explanation: 'Ta banque demande de renouveler ton autorisation (en général tous les 180 jours).', action: 'Renouveler', tone: 'warning' },
  action_required: { title: 'Action nécessaire', explanation: 'Ta banque demande une vérification (code, conditions à accepter, identifiants à mettre à jour).', action: 'Résoudre', tone: 'warning' },
  sync_error: { title: 'Erreur de synchronisation', explanation: 'La dernière synchronisation a échoué. Une nouvelle tentative aura lieu automatiquement.', action: 'Réessayer', tone: 'alert' },
  disconnected: { title: 'Déconnectée', explanation: 'L’accès a été révoqué. Les opérations importées ne sont plus mises à jour.', action: 'Reconnecter', tone: 'neutral' },
};

/** Une connexion permet-elle de vérifier automatiquement une quête ? */
export function isHealthy(status: ConnectionStatus): boolean {
  return status === 'connected' || status === 'syncing';
}
