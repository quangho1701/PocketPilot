// Owner: Hoang Anh
// Feature: OCR Expense Categorization + Transaction Management & Dashboard UI
import { View, Text, StyleSheet } from 'react-native';

export default function TransactionsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dashboard</Text>
      <Text style={styles.subtitle}>Transactions, OCR & spending overview</Text>
      <Text style={styles.owner}>Owner: Hoang Anh</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#6B7280', marginBottom: 16 },
  owner: { fontSize: 12, color: '#9CA3AF' },
});
