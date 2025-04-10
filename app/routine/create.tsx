import { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useRouter, Stack } from 'expo-router';
import { useColorScheme } from 'react-native';
import Colors from '@/constants/Colors';
import { getDatabase } from '@/utils/database';
import { StatusBar } from 'expo-status-bar';

type Exercise = {
  id: number;
  name: string;
  category: string;
  primary_muscle: string;
};

type RoutineExercise = {
  id: number;
  name: string;
  sets: number;
  exercise_order: number;
};

export default function CreateRoutineScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme ?? 'light';
  const colors = Colors[theme];

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedExercises, setSelectedExercises] = useState<RoutineExercise[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredExercises, setFilteredExercises] = useState<Exercise[]>([]);

  useEffect(() => {
    loadExercises();
  }, []);

  useEffect(() => {
    if (searchQuery) {
      const filtered = exercises.filter(exercise => 
        exercise.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        exercise.primary_muscle.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredExercises(filtered);
    } else {
      setFilteredExercises(exercises);
    }
  }, [searchQuery, exercises]);

  const loadExercises = async () => {
    try {
      const db = await getDatabase();
      const results = await db.getAllAsync<Exercise>('SELECT id, name, category, primary_muscle FROM exercises ORDER BY name');
      setExercises(results);
      setFilteredExercises(results);
    } catch (error) {
      console.error('Error loading exercises:', error);
      Alert.alert('Error', 'Failed to load exercises. Please try again.');
    }
  };

  const addExerciseToRoutine = (exercise: Exercise) => {
    const newExercise: RoutineExercise = {
      id: exercise.id,
      name: exercise.name,
      sets: 3, // Default sets
      exercise_order: selectedExercises.length
    };
    
    setSelectedExercises([...selectedExercises, newExercise]);
  };

  const removeExerciseFromRoutine = (index: number) => {
    const updatedExercises = [...selectedExercises];
    updatedExercises.splice(index, 1);
    
    // Update order numbers
    updatedExercises.forEach((exercise, idx) => {
      exercise.exercise_order = idx;
    });
    
    setSelectedExercises(updatedExercises);
  };

  const updateExerciseSets = (index: number, sets: number) => {
    if (sets < 1) return;
    
    const updatedExercises = [...selectedExercises];
    updatedExercises[index].sets = sets;
    setSelectedExercises(updatedExercises);
  };

  const saveRoutine = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a routine name');
      return;
    }
    
    if (selectedExercises.length === 0) {
      Alert.alert('Error', 'Please add at least one exercise to your routine');
      return;
    }
    
    setIsLoading(true);
    
    try {
      const db = await getDatabase();
      
      // Insert the routine
      const result = await db.runAsync(
        'INSERT INTO routines (name, description, created_at) VALUES (?, ?, ?)',
        [name.trim(), description.trim() || null, Date.now()]
      );
      
      const routineId = result.lastInsertRowId;
      
      // Insert routine exercises
      for (const exercise of selectedExercises) {
        await db.runAsync(
          'INSERT INTO routine_exercises (routine_id, exercise_id, order_num, sets) VALUES (?, ?, ?, ?)',
          [routineId, exercise.id, exercise.exercise_order, exercise.sets]
        );
      }
      
      Alert.alert('Success', 'Routine created successfully', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error) {
      console.error('Error saving routine:', error);
      Alert.alert('Error', 'Failed to save routine. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderExerciseItem = ({ item }: { item: Exercise }) => (
    <TouchableOpacity 
      style={[styles.exerciseItem, { backgroundColor: colors.card }]}
      onPress={() => addExerciseToRoutine(item)}
    >
      <View style={styles.exerciseInfo}>
        <Text style={[styles.exerciseName, { color: colors.text }]}>{item.name}</Text>
        <Text style={[styles.exerciseDetails, { color: colors.subtext }]}>
          {item.category} • {item.primary_muscle}
        </Text>
      </View>
      <FontAwesome name="plus-circle" size={20} color={colors.primary} />
    </TouchableOpacity>
  );

  const renderSelectedExerciseItem = ({ item, index }: { item: RoutineExercise, index: number }) => (
    <View style={[styles.selectedExerciseItem, { backgroundColor: colors.card }]}>
      <View style={styles.selectedExerciseInfo}>
        <Text style={[styles.selectedExerciseName, { color: colors.text }]}>{item.name}</Text>
        <View style={styles.setsContainer}>
          <Text style={[styles.setsLabel, { color: colors.subtext }]}>Sets:</Text>
          <View style={styles.setsControls}>
            <TouchableOpacity 
              style={[styles.setsButton, { backgroundColor: colors.background }]}
              onPress={() => updateExerciseSets(index, item.sets - 1)}
            >
              <FontAwesome name="minus" size={12} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.setsValue, { color: colors.text }]}>{item.sets}</Text>
            <TouchableOpacity 
              style={[styles.setsButton, { backgroundColor: colors.background }]}
              onPress={() => updateExerciseSets(index, item.sets + 1)}
            >
              <FontAwesome name="plus" size={12} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <TouchableOpacity 
        style={styles.removeButton}
        onPress={() => removeExerciseFromRoutine(index)}
      >
        <FontAwesome name="trash" size={16} color={colors.error} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <Stack.Screen 
        options={{
          title: "Create Routine",
          headerShown: true,
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
          headerRight: () => (
            <TouchableOpacity 
              style={styles.saveButton}
              onPress={saveRoutine}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={[styles.saveButtonText, { color: colors.primary }]}>Save</Text>
              )}
            </TouchableOpacity>
          ),
        }}
      />
      
      <ScrollView style={styles.scrollView}>
        <View style={styles.formSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Routine Details</Text>
          
          <View style={[styles.inputContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.inputLabel, { color: colors.subtext }]}>Name</Text>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Enter routine name"
              placeholderTextColor={colors.subtext}
              value={name}
              onChangeText={setName}
            />
          </View>
          
          <View style={[styles.inputContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.inputLabel, { color: colors.subtext }]}>Description (Optional)</Text>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Enter routine description"
              placeholderTextColor={colors.subtext}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
            />
          </View>
        </View>
        
        <View style={styles.formSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Selected Exercises</Text>
          
          {selectedExercises.length === 0 ? (
            <View style={[styles.emptyContainer, { backgroundColor: colors.card }]}>
              <FontAwesome name="list" size={24} color={colors.subtext} style={styles.emptyIcon} />
              <Text style={[styles.emptyText, { color: colors.subtext }]}>
                No exercises added yet. Select exercises from the list below.
              </Text>
            </View>
          ) : (
            <View style={styles.selectedExercisesList}>
              {selectedExercises.map((exercise, index) => (
                <View key={index}>
                  {renderSelectedExerciseItem({ item: exercise, index })}
                </View>
              ))}
            </View>
          )}
        </View>
        
        <View style={styles.formSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Available Exercises</Text>
          
          <View style={[styles.searchContainer, { backgroundColor: colors.card }]}>
            <FontAwesome name="search" size={16} color={colors.subtext} style={styles.searchIcon} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search exercises..."
              placeholderTextColor={colors.subtext}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
          
          <View style={styles.exercisesList}>
            {filteredExercises.map((exercise) => (
              <View key={exercise.id}>
                {renderExerciseItem({ item: exercise })}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  formSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  inputContainer: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 14,
    marginBottom: 4,
  },
  input: {
    fontSize: 16,
    padding: 0,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  exercisesList: {
    marginBottom: 12,
  },
  exerciseItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  exerciseDetails: {
    fontSize: 14,
  },
  selectedExercisesList: {
    marginBottom: 12,
  },
  selectedExerciseItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  selectedExerciseInfo: {
    flex: 1,
  },
  selectedExerciseName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  setsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  setsLabel: {
    fontSize: 14,
    marginRight: 8,
  },
  setsControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  setsButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  setsValue: {
    fontSize: 14,
    fontWeight: '500',
    marginHorizontal: 8,
    minWidth: 20,
    textAlign: 'center',
  },
  removeButton: {
    padding: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    borderRadius: 8,
  },
  emptyIcon: {
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
}); 