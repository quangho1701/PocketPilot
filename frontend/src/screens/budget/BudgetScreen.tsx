// Owner: Ha
// Feature: Personalized Budget Planning + Goal Simulation
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable } from 'react-native';

import { createBudget, getBudget } from '../../services/api';

export default function BudgetScreen() {
  const [month, setMonth] = useState('8');
  const [year, setYear] = useState('2026');
  const [income, setIncome] = useState('5000');
  const [savings, setSavings] = useState('1000');
  const [budget, setBudget] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState('Create a monthly budget to begin.');

  useEffect(() => {
    void loadBudget();
  }, []);

  const loadBudget = async () => {
    try {
      const data = await getBudget('demo-user');
      setBudget(data);
      if (data && typeof data === 'object' && 'id' in data) {
        setMessage(`Loaded budget for ${data.month}/${data.year}`);
      }
    } catch {
      setMessage('No budget found yet.');
    }
  };

  const handleCreate = async () => {
    try {
      const payload = {
        month: Number(month),
        year: Number(year),
        total_income: Number(income),
        planned_savings: Number(savings),
        status: 'draft',
        allocations: [],
      };
      const result = await createBudget('demo-user', payload);
      setBudget(result);
      setMessage(`Budget created for ${result.month}/${result.year}`);
    } catch (error) {
      setMessage('Unable to create the budget right now.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Budget & Goals</Text>
      <Text style={styles.subtitle}>Personalized planning & goal simulation</Text>

      <TextInput
        style={styles.input}
        placeholder="Month"
        keyboardType="numeric"
        value={month}
        onChangeText={setMonth}
      />
      <TextInput
        style={styles.input}
        placeholder="Year"
        keyboardType="numeric"
        value={year}
        onChangeText={setYear}
      />
      <TextInput
        style={styles.input}
        placeholder="Total Income"
        keyboardType="numeric"
        value={income}
        onChangeText={setIncome}
      />
      <TextInput
        style={styles.input}
        placeholder="Planned Savings"
        keyboardType="numeric"
        value={savings}
        onChangeText={setSavings}
      />

      <Pressable style={styles.button} onPress={() => void handleCreate()}>
        <Text style={styles.buttonText}>Create Budget</Text>
      </Pressable>

      <Text style={styles.message}>{message}</Text>
      {budget ? <Text style={styles.summary}>Budget ID: {String(budget.id)}</Text> : null}
      <Text style={styles.owner}>Owner: Ha</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#6B7280', marginBottom: 16 },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  button: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  buttonText: { color: '#FFFFFF', fontWeight: '600' },
  message: { color: '#374151', marginTop: 8 },
  summary: { color: '#111827', fontWeight: '600' },
  owner: { fontSize: 12, color: '#9CA3AF', marginTop: 12 },
});
