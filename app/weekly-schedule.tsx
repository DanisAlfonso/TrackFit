import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Alert, 
  ActivityIndicator, 
  ScrollView,
  Dimensions
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { useColorScheme } from 'react-native';
import { getDatabase } from '@/utils/database';
import Colors from '@/constants/Colors';
import { useTheme } from '@/context/ThemeContext';
import { Calendar, DateData } from 'react-native-calendars';

type RoutineInfo = {
  id: number;
  name: string;
  exercise_count: number;
};

type RoutineAssignment = {
  day_of_week: number;
  day_name: string;
  routines: RoutineInfo[];
};

type Routine = {
  id: number;
  name: string;
  exerciseCount: number;
};

type MarkedDates = {
  [date: string]: {
    marked?: boolean;
    dotColor?: string;
    selected?: boolean;
    selectedColor?: string;
    customContainerStyle?: {
      borderWidth?: number;
      borderColor?: string;
      borderRadius?: number;
    };
    customStyles?: {
      container: {
        backgroundColor?: string;
        borderRadius?: number;
        borderWidth?: number;
        borderColor?: string;
      };
      text: {
        color?: string;
        fontWeight?: string;
      };
    };
    periods?: {
      startingDay: boolean;
      endingDay: boolean;
      color: string;
    }[];
  };
};

export default function WeeklyScheduleScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const { theme } = useTheme();
  const systemTheme = colorScheme ?? 'light';
  const currentTheme = theme === 'system' ? systemTheme : theme;
  const colors = Colors[currentTheme];

  const [loading, setLoading] = useState(true);
  const [weekSchedule, setWeekSchedule] = useState<RoutineAssignment[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedRoutine, setSelectedRoutine] = useState<number | null>(null);
  const [routineSelectVisible, setRoutineSelectVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [markedDates, setMarkedDates] = useState<MarkedDates>({});

  const dayNames = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday',
    'Thursday', 'Friday', 'Saturday'
  ];

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    setLoading(true);
    try {
      await loadRoutines();
      await loadWeekSchedule();
      updateCalendarMarkers();
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Error', 'Failed to load schedule data');
    } finally {
      setLoading(false);
    }
  };

  const loadRoutines = async () => {
    try {
      const db = await getDatabase();
      const results = await db.getAllAsync<Routine>(`
        SELECT r.id, r.name, 
        (SELECT COUNT(*) FROM routine_exercises WHERE routine_id = r.id) as exerciseCount
        FROM routines r
        ORDER BY r.name
      `);
      setRoutines(results);
    } catch (error) {
      console.error('Error loading routines:', error);
      throw error;
    }
  };

  const loadWeekSchedule = async () => {
    try {
      const db = await getDatabase();
      
      // Query scheduled routines
      const scheduleResults = await db.getAllAsync<{
        day_of_week: number;
        routine_id: number;
        routine_name: string;
        exercise_count: number;
      }>(`
        SELECT ws.day_of_week, ws.routine_id, r.name as routine_name,
        (SELECT COUNT(*) FROM routine_exercises WHERE routine_id = r.id) as exercise_count
        FROM weekly_schedule ws
        JOIN routines r ON ws.routine_id = r.id
        ORDER BY ws.day_of_week, ws.created_at
      `);

      // Group routines by day of week
      const routinesByDay: Record<number, RoutineInfo[]> = {};
      
      // Initialize all days with empty arrays
      for (let i = 0; i < 7; i++) {
        routinesByDay[i] = [];
      }
      
      // Group routines by day
      scheduleResults.forEach(result => {
        routinesByDay[result.day_of_week].push({
          id: result.routine_id,
          name: result.routine_name,
          exercise_count: result.exercise_count
        });
      });

      // Create a full week schedule with all days
      const fullSchedule: RoutineAssignment[] = dayNames.map((name, index) => {
        return {
          day_of_week: index,
          day_name: name,
          routines: routinesByDay[index] || []
        };
      });

      setWeekSchedule(fullSchedule);
    } catch (error) {
      console.error('Error loading week schedule:', error);
      throw error;
    }
  };

  const updateCalendarMarkers = () => {
    const today = new Date();
    const markers: MarkedDates = {};
    
    // Mark the next 4 weeks with routine colors
    for (let i = 0; i < 28; i++) {
      const date = new Date();
      date.setDate(today.getDate() + i);
      
      const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const routineForDay = weekSchedule.find(s => s.day_of_week === dayOfWeek);
      
      if (routineForDay && routineForDay.routines.length > 0 && routineForDay.routines[0]) {
        const dateString = date.toISOString().split('T')[0];
        
        // Get a list of valid routines with names
        const validRoutines = weekSchedule
          .filter(d => d.routines.length > 0 && d.routines[0])
          .map(d => d.routines[0].name)
          .filter(Boolean);
        
        // Find the index of this routine's name in the list
        const routineIndex = routineForDay.routines[0].name ? 
          validRoutines.indexOf(routineForDay.routines[0].name) :
          0;
        
        const routineColor = getLegendColor(routineIndex >= 0 ? routineIndex : 0, colors);
        
        markers[dateString] = {
          // Create a more informative marker with custom styling
          customStyles: {
            container: {
              backgroundColor: routineColor,
              borderRadius: 8,
            },
            text: {
              color: 'white',
              fontWeight: '600',
            }
          },
          // Add a period to signal there's content without using the dot
          periods: [
            {
              startingDay: true,
              endingDay: true,
              color: 'transparent'
            }
          ]
        };
      }
    }
    
    // Mark today with a special style
    const todayString = today.toISOString().split('T')[0];
    markers[todayString] = {
      ...markers[todayString],
      customStyles: {
        container: {
          backgroundColor: markers[todayString]?.customStyles?.container?.backgroundColor || colors.primary,
          borderRadius: 8,
          borderWidth: 2,
          borderColor: '#ffffff',
        },
        text: {
          color: 'white',
          fontWeight: 'bold',
        }
      }
    };
    
    setMarkedDates(markers);
  };

  const handleDayPress = (day: number) => {
    setSelectedDay(day);
    
    // Pre-select the current routine for this day if it exists
    const daySchedule = weekSchedule.find(s => s.day_of_week === day);
    if (daySchedule?.routines && daySchedule.routines.length > 0) {
      setSelectedRoutine(daySchedule.routines[0].id);
    } else {
      setSelectedRoutine(null);
    }
    
    setRoutineSelectVisible(true);
  };

  const handleRoutineSelect = async (routineId: number | null) => {
    if (selectedDay === null) return;
    
    try {
      setLoading(true);
      const db = await getDatabase();
      
      if (routineId === null) {
        // Clear all routines for this day
        await db.runAsync(
          'DELETE FROM weekly_schedule WHERE day_of_week = ?',
          [selectedDay]
        );
      } else {
        // Check if this routine is already assigned to this day
        const existing = await db.getFirstAsync(
          'SELECT id FROM weekly_schedule WHERE day_of_week = ? AND routine_id = ?', 
          [selectedDay, routineId]
        );
        
        if (existing) {
          // If already assigned, remove it (toggle behavior)
          await db.runAsync(
            'DELETE FROM weekly_schedule WHERE day_of_week = ? AND routine_id = ?',
            [selectedDay, routineId]
          );
        } else {
          // Add new routine assignment
          await db.runAsync(
            'INSERT INTO weekly_schedule (day_of_week, routine_id, created_at) VALUES (?, ?, ?)',
            [selectedDay, routineId, Date.now()]
          );
        }
      }
      
      // Reload schedule
      await loadWeekSchedule();
      
      // Only close the modal if "Clear Day" was selected
      if (routineId === null) {
        setRoutineSelectVisible(false);
        setSelectedDay(null);
        setSelectedRoutine(null);
      }
    } catch (error) {
      console.error('Error updating schedule:', error);
      Alert.alert('Error', 'Failed to update schedule');
    } finally {
      setLoading(false);
    }
  };

  const handleClearSchedule = () => {
    Alert.alert(
      'Clear Schedule',
      'Are you sure you want to clear the entire weekly schedule?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              const db = await getDatabase();
              await db.runAsync('DELETE FROM weekly_schedule');
              await loadWeekSchedule();
            } catch (error) {
              console.error('Error clearing schedule:', error);
              Alert.alert('Error', 'Failed to clear schedule');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const renderDayCard = (day: RoutineAssignment) => {
    const isToday = new Date().getDay() === day.day_of_week;
    const hasRoutines = day.routines.length > 0;
    const totalExercises = day.routines.reduce((sum, routine) => 
      sum + (routine?.exercise_count || 0), 0);

    return (
      <TouchableOpacity
        key={day.day_of_week}
        style={[
          styles.dayCard,
          {
            backgroundColor: colors.card,
            borderColor: isToday ? colors.primary : 'transparent',
            borderWidth: isToday ? 2 : 0,
          }
        ]}
        onPress={() => handleDayPress(day.day_of_week)}
        activeOpacity={0.7}
      >
        <View style={styles.dayHeader}>
          <Text style={[styles.dayName, { color: colors.text }]}>{day.day_name}</Text>
          {isToday && (
            <View style={[styles.todayBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.todayText}>TODAY</Text>
            </View>
          )}
        </View>

        {hasRoutines ? (
          <View style={styles.multiRoutineContainer}>
            <View style={styles.routinesSummary}>
              <View style={[styles.totalExercisesBadge, { backgroundColor: '#E6F7FF' }]}>
                <FontAwesome5 name="dumbbell" size={12} color="#0099FF" style={styles.summaryIcon} />
                <Text style={[styles.totalExercisesText, { color: '#0099FF' }]}>
                  {totalExercises} exercise{totalExercises !== 1 ? 's' : ''}
                </Text>
              </View>
              <Text style={[styles.routineCount, { color: colors.subtext }]}>
                {day.routines.length} routine{day.routines.length !== 1 ? 's' : ''}
              </Text>
            </View>
            
            <View style={styles.dayRoutineList}>
              {day.routines.map((routine, index) => 
                routine && routine.name ? (
                  <View 
                    key={routine.id} 
                    style={[
                      styles.routineChip, 
                      { backgroundColor: getLegendColor(index % 7, colors) }
                    ]}
                  >
                    <Text style={styles.routineChipText} numberOfLines={1}>{routine.name}</Text>
                  </View>
                ) : null
              )}
            </View>
          </View>
        ) : (
          <View style={styles.noRoutineContainer}>
            <Text style={[styles.noRoutineText, { color: colors.subtext }]}>No workout planned</Text>
            <TouchableOpacity>
              <Text style={[styles.addRoutineText, { color: colors.primary }]}>Add</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.dayFooter}>
          <FontAwesome5 
            name="edit" 
            size={14} 
            color="#0099FF" 
            style={styles.editIcon} 
          />
          <Text style={[styles.tapToEdit, { color: "#0099FF" }]}>
            {hasRoutines ? 'Manage' : 'Manage'} routines
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  // Routine selection modal (displayed when a day is selected)
  const renderRoutineSelection = () => {
    if (!routineSelectVisible) return null;

    // Get the current routines for the selected day
    const selectedDayData = weekSchedule.find(day => day.day_of_week === selectedDay);
    const selectedRoutineIds = selectedDayData ? selectedDayData.routines.map(r => r.id) : [];

    return (
      <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
        <View style={[styles.routineSelectModal, { backgroundColor: colors.card }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>
            Select Routines for {dayNames[selectedDay || 0]}
          </Text>
          <Text style={[styles.modalSubtitle, { color: colors.subtext }]}>
            Tap routines to select/deselect
          </Text>
            
          <ScrollView 
            style={styles.routineList}
            contentContainerStyle={styles.routineListContent}
            showsVerticalScrollIndicator={false}
          >
            <TouchableOpacity
              style={[
                styles.routineOption,
                { borderBottomColor: colors.border, borderBottomWidth: 1 }
              ]}
              onPress={() => handleRoutineSelect(null)}
            >
              <View style={styles.routineOptionContent}>
                <View style={[styles.emptyRoutineIcon, { backgroundColor: colors.border }]}>
                  <FontAwesome5 name="times" size={16} color={colors.subtext} />
                </View>
                <View>
                  <Text style={[styles.routineOptionName, { color: colors.text }]}>
                    Rest Day
                  </Text>
                  <Text style={[styles.routineOptionDescription, { color: colors.subtext }]}>
                    Clear all routines from this day
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            {routines.map((routine, index) => {
              const isSelected = selectedRoutineIds.includes(routine.id);
              return (
                <TouchableOpacity
                  key={routine.id}
                  style={[
                    styles.routineOption,
                    { 
                      borderBottomColor: colors.border, 
                      borderBottomWidth: 1,
                      backgroundColor: isSelected ? `${colors.primary}15` : 'transparent'
                    }
                  ]}
                  onPress={() => handleRoutineSelect(routine.id)}
                >
                  <View style={styles.routineOptionContent}>
                    <LinearGradient
                      colors={[colors.primary, colors.secondary]}
                      style={styles.routineIconGradient}
                    >
                      <FontAwesome5 name="dumbbell" size={16} color="white" />
                    </LinearGradient>
                    <View>
                      <Text style={[styles.routineOptionName, { color: colors.text }]}>
                        {routine.name}
                      </Text>
                      <Text style={[styles.routineOptionDescription, { color: colors.subtext }]}>
                        {routine.exerciseCount} exercise{routine.exerciseCount !== 1 ? 's' : ''}
                      </Text>
                    </View>
                  </View>
                  {isSelected && (
                    <FontAwesome5 name="check-circle" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          
          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={[styles.modalButton, styles.cancelButton, { borderColor: colors.border, backgroundColor: '#F2F2F2' }]}
              onPress={() => {
                setRoutineSelectVisible(false);
                setSelectedDay(null);
                setSelectedRoutine(null);
              }}
            >
              <Text style={[styles.cancelButtonText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.modalButton, styles.doneButton, { backgroundColor: colors.primary }]}
              onPress={() => {
                setRoutineSelectVisible(false);
                setSelectedDay(null);
                setSelectedRoutine(null);
              }}
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  // Called after the week schedule is loaded to update calendar markers
  useEffect(() => {
    if (weekSchedule.length > 0) {
      updateCalendarMarkers();
    }
  }, [weekSchedule]);

  // Handle calendar date change
  const onDateSelect = (date: DateData) => {
    const selectedDate = new Date(date.dateString);
    setSelectedDate(selectedDate);
    
    // Automatically scroll to and highlight the corresponding day of week
    const dayOfWeek = selectedDate.getDay();
    const dayItem = weekSchedule.find(day => day.day_of_week === dayOfWeek);
    
    if (dayItem) {
      handleDayPress(dayOfWeek);
    }
  };

  // Render a summary grid showing the entire week at once
  const renderWeeklyGrid = () => {
    // Get a list of valid routines with names
    const validRoutines = weekSchedule
      .filter(day => day.routines.length > 0 && day.routines[0]?.name)
      .map(day => day.routines[0].name)
      .filter(Boolean);
      
    return (
      <View style={[styles.weeklyGridContainer, { backgroundColor: colors.card }]}>
        <Text style={[styles.weeklyGridTitle, { color: colors.text }]}>Weekly Training Split</Text>
        
        <View style={styles.gridLegendContainer}>
          {validRoutines
            .filter((routineName, index, self) => self.indexOf(routineName) === index) // Get unique routine names
            .map((routineName, index) => (
              <View key={index} style={styles.legendItem}>
                <View 
                  style={[
                    styles.legendColorBox, 
                    { backgroundColor: getLegendColor(index, colors) }
                  ]} 
                />
                <Text style={[styles.legendText, { color: colors.subtext }]} numberOfLines={1}>
                  {routineName}
                </Text>
              </View>
            ))}
        </View>
        
        <View style={styles.weekGrid}>
          {weekSchedule.map((day, index) => {
            const hasRoutine = day.routines.length > 0 && day.routines[0]?.name;
            const isToday = new Date().getDay() === day.day_of_week;
            
            let routineIndex = -1;
            if (hasRoutine && day.routines[0]?.name) {
              routineIndex = validRoutines.indexOf(day.routines[0].name);
            }
            
            return (
              <TouchableOpacity 
                key={index}
                style={[
                  styles.dayGridCell,
                  { 
                    backgroundColor: hasRoutine && routineIndex >= 0
                      ? getLegendColor(routineIndex, colors) 
                      : 'transparent',
                    borderColor: isToday ? colors.primary : colors.border
                  }
                ]}
                onPress={() => handleDayPress(day.day_of_week)}
              >
                <Text style={[
                  styles.dayGridName, 
                  { 
                    color: hasRoutine ? '#fff' : colors.text,
                    fontWeight: isToday ? 'bold' : 'normal'
                  }
                ]}>
                  {day.day_name.slice(0, 3)}
                </Text>
                
                {hasRoutine && day.routines[0]?.name && (
                  <Text style={styles.dayGridRoutine} numberOfLines={1}>
                    {day.routines[0].name}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };
  
  // Helper function to get colors for different routines
  const getLegendColor = (index: number, colors: any) => {
    const colorOptions = [
      colors.primary,
      colors.secondary,
      colors.accent,
      '#8a5cde', // purple
      '#50a2a7', // teal
      '#f2994a', // orange
      '#4a6cf2', // blue
    ];
    
    return colorOptions[index % colorOptions.length];
  };

  if (loading && weekSchedule.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Weekly Schedule' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.subtext }]}>
            Loading schedule...
          </Text>
        </View>
      </View>
    );
  }

  const calendarTheme = {
    backgroundColor: 'transparent',
    calendarBackground: 'transparent',
    textSectionTitleColor: colors.subtext,
    selectedDayBackgroundColor: colors.primary,
    selectedDayTextColor: '#ffffff',
    todayTextColor: colors.primary,
    dayTextColor: colors.text,
    textDisabledColor: colors.border,
    dotColor: colors.primary,
    selectedDotColor: '#ffffff',
    arrowColor: colors.primary,
    monthTextColor: colors.text,
    indicatorColor: colors.primary,
    textDayFontWeight: '400',
    textMonthFontWeight: 'bold',
    textDayHeaderFontWeight: '600',
    textDayFontSize: 14,
    textMonthFontSize: 18,
    textDayHeaderFontSize: 13,
    'stylesheet.calendar.main': {
      week: {
        marginVertical: 2,
        flexDirection: 'row',
        justifyContent: 'space-around',
      }
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: 'Weekly Schedule' }} />
      
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Weekly Schedule</Text>
        <TouchableOpacity 
          style={[styles.clearButton, { borderColor: colors.error }]}
          onPress={handleClearSchedule}
        >
          <FontAwesome5 name="trash-alt" size={14} color={colors.error} />
          <Text style={[styles.clearButtonText, { color: colors.error }]}>Clear All</Text>
        </TouchableOpacity>
      </View>
      
      <Text style={[styles.description, { color: colors.subtext }]}>
        Plan your workout week by assigning routines to specific days
      </Text>
      
      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Weekly Calendar Grid Overview */}
        {renderWeeklyGrid()}

        {/* Calendar View */}
        <View style={[styles.calendarContainer, { backgroundColor: colors.card }]}>
          <Text style={[styles.calendarTitle, { color: colors.text }]}>Monthly Overview</Text>
          <Calendar
            theme={calendarTheme}
            markingType='custom'
            markedDates={markedDates}
            onDayPress={onDateSelect}
            enableSwipeMonths
            hideExtraDays
          />
          <View style={styles.calendarLegend}>
            {weekSchedule
              .filter(day => day.routines.length > 0 && day.routines[0] && day.routines[0].name)
              .map(day => day.routines[0].name)
              .filter((routineName, index, self) => self.indexOf(routineName) === index) // Get unique routine names
              .map((routineName, index) => (
                <View key={index} style={styles.calendarLegendItem}>
                  <View 
                    style={[
                      styles.calendarLegendColor, 
                      { backgroundColor: getLegendColor(index, colors) }
                    ]} 
                  />
                  <Text style={[styles.calendarLegendText, { color: colors.subtext }]} numberOfLines={1}>
                    {routineName}
                  </Text>
                </View>
              ))}
          </View>
        </View>
        
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Daily Details</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.subtext }]}>
            Tap on a day to assign a routine
          </Text>
        </View>
        
        {/* Daily Cards */}
        {weekSchedule.map(day => renderDayCard(day))}
      </ScrollView>
      
      {renderRoutineSelection()}
    </View>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  description: {
    fontSize: 16,
    marginBottom: 24,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  clearButtonText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '500',
  },
  scrollContent: {
    paddingBottom: 30,
  },
  dayCard: {
    borderRadius: 20,
    marginBottom: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  dayName: {
    fontSize: 19,
    fontWeight: 'bold',
  },
  todayBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  todayText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  multiRoutineContainer: {
    flexDirection: 'column',
    marginBottom: 16,
  },
  routinesSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  totalExercisesBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#E6F7FF',
  },
  summaryIcon: {
    marginRight: 6,
    color: '#0099FF',
  },
  totalExercisesText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0099FF',
  },
  routineCount: {
    fontSize: 14,
    opacity: 0.8,
  },
  dayRoutineList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
    gap: 8,
  },
  routineChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 6,
    marginBottom: 0,
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  routineChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'white',
  },
  addRoutineButton: {
    padding: 8,
    borderWidth: 1,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  noRoutineContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  noRoutineText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  addRoutineText: {
    fontSize: 14,
    fontWeight: '600',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  addButtonText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '500',
  },
  dayFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editIcon: {
    marginRight: 6,
  },
  tapToEdit: {
    fontSize: 13,
    fontWeight: '500',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  routineSelectModal: {
    width: width * 0.85,
    maxHeight: '80%',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: 20,
    textAlign: 'center',
    opacity: 0.7,
  },
  routineList: {
    maxHeight: 400,
  },
  routineListContent: {
    paddingVertical: 8,
  },
  routineOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    marginVertical: 4,
    borderRadius: 12,
  },
  routineOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  routineIconGradient: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  emptyRoutineIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  routineOptionName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  routineOptionDescription: {
    fontSize: 14,
    opacity: 0.7,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    paddingHorizontal: 10,
  },
  modalButton: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 16,
    minWidth: 130,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  cancelButton: {
    borderWidth: 0,
    backgroundColor: '#F2F2F2',
  },
  cancelButtonText: {
    fontWeight: '600',
    fontSize: 16,
    color: '#333333',
  },
  doneButton: {
    // backgroundColor set dynamically in the component
  },
  doneButtonText: {
    fontWeight: '600',
    fontSize: 16,
    color: 'white',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  calendarContainer: {
    marginBottom: 24,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  calendarTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  calendarLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    gap: 12,
  },
  calendarLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
    marginBottom: 8,
  },
  calendarLegendColor: {
    width: 16,
    height: 16,
    borderRadius: 5,
    marginRight: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  calendarLegendText: {
    fontSize: 13,
    fontWeight: '500',
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
  },
  // Weekly Grid Styles
  weeklyGridContainer: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  weeklyGridTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  gridLegendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 18,
    paddingHorizontal: 8,
    gap: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
    marginBottom: 8,
  },
  legendColorBox: {
    width: 14,
    height: 14,
    borderRadius: 5,
    marginRight: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  legendText: {
    fontSize: 13,
    fontWeight: '500',
    maxWidth: 120,
  },
  weekGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  dayGridCell: {
    width: '13.5%',
    aspectRatio: 1,
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 0.5,
  },
  dayGridName: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
    textAlign: 'center',
  },
  dayGridRoutine: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.95)',
    textAlign: 'center',
    fontWeight: '500',
  },
}); 