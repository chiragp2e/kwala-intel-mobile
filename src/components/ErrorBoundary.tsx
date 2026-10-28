import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { reportError } from '../lib/diagnostics';
import { colors, spacing, type } from '../theme/tokens';
import { Button } from './Button';

interface State {
  failed: boolean;
}

/** Last line of defence: a render crash shows a recovery screen instead of a white one. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    reportError(error, 'render');
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={styles.wrap} accessibilityRole="alert">
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>Kwala hit an unexpected problem. Your chats are saved on our servers.</Text>
        <Button label="Reload" onPress={() => this.setState({ failed: false })} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
  title: { ...type.heroSerif, fontSize: 26, textAlign: 'center' },
  body: { ...type.small, textAlign: 'center' },
});
