// Owner: Ha
// Feature: Personalized Budget Planning + Goal Simulation
import { View, Text, StyleSheet } from 'react-native';

export default function BudgetScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Budget & Goals</Text>
      <Text style={styles.subtitle}>Personalized planning & goal simulation</Text>
      <Text style={styles.owner}>Owner: Ha</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#6B7280', marginBottom: 16 },
  owner: { fontSize: 12, color: '#9CA3AF' },
});
