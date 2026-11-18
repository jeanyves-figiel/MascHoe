// Last-resort guard: an exception while rendering would otherwise leave a blank screen
// in a release build (no red box). Shows the message so testers can report it.
import React from 'react';
import { ScrollView, Text, View } from 'react-native';

type State = { error: Error | null };

export class StartupGuard extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Render error', error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: '#17142E', paddingTop: 80, paddingHorizontal: 24 }}>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 12 }}>Something went wrong</Text>
        <Text style={{ color: '#bbb', marginBottom: 16 }}>Please send a screenshot of this screen.</Text>
        <ScrollView>
          <Text selectable style={{ color: '#ff8a7a', fontFamily: 'Menlo', fontSize: 12 }}>
            {String(error?.message ?? error)}
            {'\n\n'}
            {error?.stack ?? ''}
          </Text>
        </ScrollView>
      </View>
    );
  }
}
