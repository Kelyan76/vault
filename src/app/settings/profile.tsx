import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { updateProfile } from '@/store/actions';
import { useStore } from '@/store/store';
import { Avatar, AVATARS, avatarLabel } from '@/art/Avatar';
import { Screen, Notice } from '@/ui/layout';
import { Button, Field, Row, T } from '@/ui/primitives';
import { colors, space } from '@/theme/tokens';

export default function EditProfile() {
  const { data, act } = useStore();
  const [pseudo, setPseudo] = useState(data.profile.pseudo);
  const [avatar, setAvatar] = useState(data.profile.avatar);
  const [error, setError] = useState<string | null>(null);
  return (
    <Screen back title="Mon profil">
      <View style={{ gap: space.md }}>
        <Field label="Pseudo" value={pseudo} onChangeText={setPseudo} autoCapitalize="none" maxLength={20} />
        <T v="small" color={colors.textMuted}>
          Couleur de ton badge
        </T>
        <Row gap={10} style={{ flexWrap: 'wrap' }}>
          {AVATARS.map((a) => (
            <Pressable key={a} onPress={() => setAvatar(a)} accessibilityRole="radio" accessibilityState={{ selected: avatar === a }} accessibilityLabel={avatarLabel(a)}>
              <Avatar id={a} name={pseudo} size={56} ring={avatar === a ? colors.text : undefined} />
            </Pressable>
          ))}
        </Row>
        {error ? <Notice tone="alert" text={error} /> : null}
        <Button
          label="Enregistrer"
          onPress={() => {
            const err = act((d, env) => updateProfile(d, { pseudo, avatar }, env));
            if (err) return setError(err);
            router.back();
          }}
        />
      </View>
    </Screen>
  );
}
