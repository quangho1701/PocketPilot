// Owner: Ngu
// Feature: Real-Time Spending Assistant + Weekly AI Insights & Alerts
import { View, Text, StyleSheet } from 'react-native';

export default function AssistantScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Spending Assistant</Text>
      <Text style={styles.subtitle}>Buy / Wait / Skip recommendations</Text>
      <Text style={styles.owner}>Owner: Ngu</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#6B7280', marginBottom: 16 },
  owner: { fontSize: 12, color: '#9CA3AF' },
});
