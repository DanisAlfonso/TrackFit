import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  TextInput, 
  Alert,
  Modal,
  ActivityIndicator,
  Dimensions,
  Animated
} from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { LineChart } from 'react-native-chart-kit';
import Colors from '@/constants/Colors';
import { getDatabase } from '@/utils/database';
import { useTheme } from '@/context/ThemeContext';
import { getWeightUnitPreference, WeightUnit, kgToLb, lbToKg } from './(tabs)/profile';

// Define types for measurements
type MeasurementType = 'weight' | 'height' | 'chest' | 'waist' | 'hips' | 'biceps' | 'thighs' | 'calves' | 'custom';

type Measurement = {
  id: number;
  type: MeasurementType;
  value: number;
  date: number;
  unit: string;
  custom_name?: string;
};

type MeasurementEntry = {
  type: MeasurementType;
  value: string;
  unit: string;
  custom_name?: string;
};

type MeasurementDisplay = {
  key: MeasurementType;
  label: string;
  icon: string;
  unit: string;
  isTracking: boolean;
  customName?: string;
};

type ChartData = {
  labels: string[];
  datasets: {
    data: number[];
    color?: (opacity: number) => string;
    strokeWidth?: number;
  }[];
};

const screenWidth = Dimensions.get('window').width;

export default function MeasurementsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const { theme } = useTheme();
  const systemTheme = colorScheme ?? 'light';
  const currentTheme = theme === 'system' ? systemTheme : theme;
  const colors = Colors[currentTheme];
  
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg');
  const [loading, setLoading] = useState(true);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [selectedTab, setSelectedTab] = useState<MeasurementType>('weight');
  const [newEntry, setNewEntry] = useState<MeasurementEntry>({
    type: 'weight',
    value: '',
    unit: 'kg'
  });
  
  // State to store all measurement data and what user is tracking
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [userMeasurements, setUserMeasurements] = useState<MeasurementDisplay[]>([
    { key: 'weight', label: 'Weight', icon: 'weight', unit: 'kg', isTracking: true },
    { key: 'height', label: 'Height', icon: 'ruler-vertical', unit: 'cm', isTracking: true },
    { key: 'chest', label: 'Chest', icon: 'tshirt', unit: 'cm', isTracking: false },
    { key: 'waist', label: 'Waist', icon: 'ruler', unit: 'cm', isTracking: false },
    { key: 'hips', label: 'Hips', icon: 'ruler', unit: 'cm', isTracking: false },
    { key: 'biceps', label: 'Biceps', icon: 'dumbbell', unit: 'cm', isTracking: false },
    { key: 'thighs', label: 'Thighs', icon: 'running', unit: 'cm', isTracking: false },
    { key: 'calves', label: 'Calves', icon: 'shoe-prints', unit: 'cm', isTracking: false }
  ]);
  
  // Animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  
  // Load data on initial render
  useEffect(() => {
    loadData();
  }, []);
  
  // Refresh data when the screen comes into focus (like when returning from settings)
  useFocusEffect(
    useCallback(() => {
      // Skip initial load since useEffect already handles that
      // This will only run when returning to this screen from another screen
      const refreshData = async () => {
        try {
          setLoading(true);
          await loadTrackedMeasurements();
          await loadMeasurementData();
          handleTabSelection(); // Check if we need to handle special cases after loading data
        } catch (error) {
          console.error('Error refreshing measurements:', error);
        } finally {
          setLoading(false);
        }
      };
      
      refreshData();
      
      return () => {
        // Cleanup if needed
      };
    }, [])
  );
  
  // If height is the only tracked measurement, show it, otherwise select first non-height option
  useEffect(() => {
    const trackedMeasurements = userMeasurements.filter(m => m.isTracking);
    if (selectedTab === 'height' && trackedMeasurements.length > 1) {
      const nonHeightOption = trackedMeasurements.find(m => m.key !== 'height');
      if (nonHeightOption) {
        setSelectedTab(nonHeightOption.key);
      }
    }
    
    // If the selected tab is no longer being tracked, pick a new one
    if (trackedMeasurements.length > 0 && !trackedMeasurements.some(m => m.key === selectedTab)) {
      setSelectedTab(trackedMeasurements[0].key);
    }
  }, [userMeasurements, selectedTab]);
  
  const loadData = async () => {
    try {
      setLoading(true);
      const unit = await getWeightUnitPreference();
      setWeightUnit(unit);
      
      // Load user tracked measurements preference from database
      await loadTrackedMeasurements();
      
      // Load measurement data
      await loadMeasurementData();
    } catch (error) {
      console.error('Error loading measurements:', error);
      Alert.alert('Error', 'Failed to load your measurement data');
    } finally {
      setLoading(false);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true
      }).start();
    }
  };
  
  const loadTrackedMeasurements = async () => {
    try {
      const db = await getDatabase();
      
      // Create the measurement_preferences table if it doesn't exist
      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS measurement_preferences (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL UNIQUE,
          is_tracking INTEGER NOT NULL DEFAULT 0,
          custom_name TEXT
        )
      `);
      
      // Load existing preferences
      const preferences = await db.getAllAsync<{type: MeasurementType, is_tracking: number, custom_name: string | null}>(`
        SELECT type, is_tracking, custom_name FROM measurement_preferences
      `);
      
      if (preferences.length > 0) {
        // Update the userMeasurements state with saved preferences
        const updatedMeasurements = [...userMeasurements];
        preferences.forEach(pref => {
          const index = updatedMeasurements.findIndex(m => m.key === pref.type);
          if (index > -1) {
            updatedMeasurements[index].isTracking = pref.is_tracking === 1;
            if (pref.custom_name) {
              updatedMeasurements[index].customName = pref.custom_name;
            }
          }
        });
        setUserMeasurements(updatedMeasurements);
      } else {
        // Initialize with defaults (weight and height tracked by default)
        for (const measure of userMeasurements) {
          await db.runAsync(`
            INSERT OR IGNORE INTO measurement_preferences (type, is_tracking)
            VALUES (?, ?)
          `, [measure.key, measure.isTracking ? 1 : 0]);
        }
      }
    } catch (error) {
      console.error('Error loading tracked measurements:', error);
    }
  };
  
  const loadMeasurementData = async () => {
    try {
      const db = await getDatabase();
      
      // Create the measurements table if it doesn't exist
      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS measurements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          value REAL NOT NULL,
          date INTEGER NOT NULL,
          unit TEXT NOT NULL,
          custom_name TEXT
        )
      `);
      
      // Load all measurements (even for types not currently being tracked)
      // This ensures data persists even when a measurement type is temporarily disabled
      const data = await db.getAllAsync<Measurement>(`
        SELECT id, type, value, date, unit, custom_name
        FROM measurements
        ORDER BY date DESC
      `);
      
      setMeasurements(data);
    } catch (error) {
      console.error('Error loading measurement data:', error);
    }
  };
  
  const saveMeasurement = async () => {
    if (!newEntry.value || isNaN(parseFloat(newEntry.value))) {
      Alert.alert('Invalid Entry', 'Please enter a valid number');
      return;
    }
    
    try {
      setLoading(true);
      const db = await getDatabase();
      
      // Convert if needed (for weight)
      let valueToSave = parseFloat(newEntry.value);
      let unitToSave = newEntry.unit;
      
      if (newEntry.type === 'weight' && newEntry.unit !== weightUnit) {
        if (newEntry.unit === 'lb' && weightUnit === 'kg') {
          valueToSave = lbToKg(valueToSave);
          unitToSave = 'kg';
        } else if (newEntry.unit === 'kg' && weightUnit === 'lb') {
          valueToSave = kgToLb(valueToSave);
          unitToSave = 'lb';
        }
      }
      
      // Save new measurement
      const result = await db.runAsync(`
        INSERT INTO measurements (type, value, date, unit, custom_name)
        VALUES (?, ?, ?, ?, ?)
      `, [
        newEntry.type,
        valueToSave,
        Date.now(),
        unitToSave,
        newEntry.custom_name || null
      ]);
      
      // If this is the first time tracking this measurement, update preferences
      const measureIndex = userMeasurements.findIndex(m => m.key === newEntry.type);
      if (measureIndex > -1 && !userMeasurements[measureIndex].isTracking) {
        await db.runAsync(`
          UPDATE measurement_preferences
          SET is_tracking = 1
          WHERE type = ?
        `, [newEntry.type]);
        
        const updatedMeasurements = [...userMeasurements];
        updatedMeasurements[measureIndex].isTracking = true;
        setUserMeasurements(updatedMeasurements);
      }
      
      // Reload measurement data
      await loadMeasurementData();
      
      // Reset form and close modal
      setNewEntry({
        type: 'weight',
        value: '',
        unit: weightUnit
      });
      setAddModalVisible(false);
      
    } catch (error) {
      console.error('Error saving measurement:', error);
      Alert.alert('Error', 'Failed to save your measurement');
    } finally {
      setLoading(false);
    }
  };
  
  const toggleTrackMeasurement = async (type: MeasurementType, forcedState?: boolean) => {
    try {
      const db = await getDatabase();
      const measureIndex = userMeasurements.findIndex(m => m.key === type);
      
      if (measureIndex > -1) {
        // Use forced state if provided, otherwise toggle current state
        const newIsTracking = forcedState !== undefined ? forcedState : !userMeasurements[measureIndex].isTracking;
        
        // Update database
        await db.runAsync(`
          UPDATE measurement_preferences
          SET is_tracking = ?
          WHERE type = ?
        `, [newIsTracking ? 1 : 0, type]);
        
        // Update state
        const updatedMeasurements = [...userMeasurements];
        updatedMeasurements[measureIndex].isTracking = newIsTracking;
        setUserMeasurements(updatedMeasurements);
        
        // Important: We don't delete the actual measurement data
        // It remains in the measurements table even when not tracked
        // This ensures data persists when re-enabling tracking
      }
    } catch (error) {
      console.error('Error toggling measurement tracking:', error);
      Alert.alert('Error', 'Failed to update your preferences');
    }
  };
  
  const deleteMeasurement = async (id: number) => {
    try {
      const db = await getDatabase();
      
      // Delete measurement
      await db.runAsync(`DELETE FROM measurements WHERE id = ?`, [id]);
      
      // Reload data
      await loadMeasurementData();
    } catch (error) {
      console.error('Error deleting measurement:', error);
      Alert.alert('Error', 'Failed to delete measurement');
    }
  };
  
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };
  
  const getMeasurementColor = (type: MeasurementType): string => {
    switch(type) {
      case 'weight': return 'rgb(75, 120, 240)';
      case 'chest': return 'rgb(240, 80, 120)';
      case 'waist': return 'rgb(46, 204, 113)';
      case 'hips': return 'rgb(155, 89, 182)';
      case 'biceps': return 'rgb(241, 196, 15)';
      case 'thighs': return 'rgb(231, 76, 60)';
      case 'calves': return 'rgb(52, 152, 219)';
      default: return colors.primary;
    }
  };
  
  const prepareChartData = (type: MeasurementType): ChartData => {
    // Filter measurements by type
    const filteredData = measurements
      .filter(m => m.type === type)
      .sort((a, b) => a.date - b.date);
    
    if (filteredData.length === 0) {
      // This will now be handled by conditional rendering instead
      return {
        labels: [],
        datasets: [{ data: [] }]
      };
    }
    
    // Special case for single data point
    if (filteredData.length === 1) {
      const dateLabel = formatDate(filteredData[0].date).substring(0, 6);
      return {
        labels: [dateLabel, dateLabel], // Duplicate the label to show a point
        datasets: [{ 
          data: [filteredData[0].value, filteredData[0].value], // Duplicate the value to show a flat line
          color: () => getMeasurementColor(type),
          strokeWidth: 3
        }]
      };
    }
    
    // Prepare last 10 entries for chart
    const chartData = filteredData.slice(-10);
    
    return {
      labels: chartData.map(item => formatDate(item.date).substring(0, 6)),
      datasets: [{
        data: chartData.map(item => item.value),
        color: () => getMeasurementColor(type),
        strokeWidth: 3
      }]
    };
  };
  
  const getChangeColor = (measurements: Measurement[]): string => {
    if (measurements.length < 2) return colors.text;
    
    // Measurements are sorted by date DESC, so first is latest
    const latest = measurements[0].value;
    const previous = measurements[1].value;
    
    // For weight, lower is generally better
    if (measurements[0].type === 'weight') {
      return latest < previous ? colors.success : latest > previous ? colors.error : colors.text;
    }
    
    // For other body measurements, higher generally means growth/progress
    return latest > previous ? colors.success : latest < previous ? colors.error : colors.text;
  };
  
  const getChangeText = (measurements: Measurement[]): string => {
    if (measurements.length < 2) return "N/A";
    
    // Measurements are sorted by date DESC, so first is latest
    const latest = measurements[0].value;
    const previous = measurements[1].value;
    const diff = latest - previous;
    const percentChange = ((diff / previous) * 100).toFixed(1);
    
    const changeSymbol = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
    return `${changeSymbol} ${Math.abs(diff).toFixed(1)} ${measurements[0].unit} (${diff > 0 ? '+' : ''}${percentChange}%)`;
  };

  const renderMeasurementTabs = () => {
    const trackedMeasurements = userMeasurements.filter(m => m.isTracking);
    
    if (trackedMeasurements.length === 0) {
      return (
        <View style={styles.emptyState}>
          <FontAwesome5 name="chart-line" size={40} color={colors.subtext} />
          <Text style={[styles.emptyStateText, { color: colors.text }]}>
            Start tracking your body measurements
          </Text>
          <Text style={[styles.emptyStateSubText, { color: colors.subtext }]}>
            Add your first measurement to see your progress
          </Text>
          <TouchableOpacity
            style={[styles.emptyStateButton, { backgroundColor: colors.primary }]}
            onPress={() => setAddModalVisible(true)}
          >
            <Text style={styles.emptyStateButtonText}>Add Measurement</Text>
          </TouchableOpacity>
        </View>
      );
    }
    
    // Filter out height from tab selection if it's the only measurement
    const displayedMeasurements = trackedMeasurements.filter(m => m.key !== 'height' || trackedMeasurements.length === 1);
    
    return (
      <View style={styles.content}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          style={styles.tabsContainer}
          contentContainerStyle={styles.tabs}
        >
          {displayedMeasurements.map(measure => (
            <TouchableOpacity
              key={measure.key}
              style={[
                styles.tab,
                selectedTab === measure.key && [styles.activeTab, { borderColor: colors.primary }]
              ]}
              onPress={() => setSelectedTab(measure.key)}
            >
              <FontAwesome5
                name={measure.icon}
                size={16}
                color={selectedTab === measure.key ? colors.primary : colors.subtext}
                style={styles.tabIcon}
              />
              <Text
                style={[
                  styles.tabText,
                  { color: selectedTab === measure.key ? colors.primary : colors.subtext }
                ]}
              >
                {measure.customName || measure.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        
        {/* Only show chart for non-height measurements */}
        {selectedTab !== 'height' && (
          <View style={[styles.chartContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.chartTitle, { color: colors.text }]}>
              {userMeasurements.find(m => m.key === selectedTab)?.customName || 
               userMeasurements.find(m => m.key === selectedTab)?.label} Progress
            </Text>
            
            {measurements.filter(m => m.type === selectedTab).length === 0 ? (
              <View style={styles.emptyChartContainer}>
                <FontAwesome5 name="chart-line" size={32} color={colors.subtext} />
                <Text style={[styles.emptyChartText, { color: colors.subtext }]}>
                  No data available yet
                </Text>
                <Text style={[styles.emptyChartSubText, { color: colors.subtext }]}>
                  Add your first measurement to see your progress chart
                </Text>
                <TouchableOpacity
                  style={[styles.emptyChartButton, { backgroundColor: colors.primary }]}
                  onPress={() => setAddModalVisible(true)}
                >
                  <Text style={styles.emptyChartButtonText}>Add Measurement</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.chartWrapper}>
                <LineChart
                  data={prepareChartData(selectedTab)}
                  width={screenWidth - 40}
                  height={220}
                  chartConfig={{
                    backgroundColor: colors.card,
                    backgroundGradientFrom: colors.card,
                    backgroundGradientTo: colors.card,
                    decimalPlaces: 1,
                    color: () => getMeasurementColor(selectedTab), 
                    labelColor: () => colors.text,
                    style: {
                      borderRadius: 16
                    },
                    propsForDots: {
                      r: "6",
                      strokeWidth: "2",
                      stroke: getMeasurementColor(selectedTab)
                    }
                  }}
                  bezier
                  withDots={true}
                  withInnerLines={false}
                  withOuterLines={true}
                  withVerticalLines={false}
                  withHorizontalLines={true}
                  style={styles.chart}
                />
              </View>
            )}
            
            <View style={styles.latestContainer}>
              {measurements.filter(m => m.type === selectedTab).length > 0 ? (
                <>
                  <View style={styles.progressSummary}>
                    <Text style={[styles.latestLabel, { color: colors.subtext }]}>Latest</Text>
                    <Text style={[styles.latestValue, { color: colors.text }]}>
                      {measurements.filter(m => m.type === selectedTab)[0].value} 
                      {' '}{measurements.filter(m => m.type === selectedTab)[0].unit}
                    </Text>
                  </View>
                  
                  {measurements.filter(m => m.type === selectedTab).length >= 2 && (
                    <View style={styles.progressSummary}>
                      <Text style={[styles.latestLabel, { color: colors.subtext }]}>Change</Text>
                      <Text style={[
                        styles.changeValue, 
                        { 
                          color: getChangeColor(measurements.filter(m => m.type === selectedTab)) 
                        }
                      ]}>
                        {getChangeText(measurements.filter(m => m.type === selectedTab))}
                      </Text>
                    </View>
                  )}
                </>
              ) : (
                <Text style={[styles.noDataText, { color: colors.subtext }]}>
                  No data available yet
                </Text>
              )}
            </View>
          </View>
        )}
        
        {/* For height, show a simpler card with just the latest value */}
        {selectedTab === 'height' && (
          <View style={[styles.heightContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.heightTitle, { color: colors.text }]}>Height</Text>
            {measurements.filter(m => m.type === 'height').length > 0 ? (
              <View style={styles.heightValueContainer}>
                <Text style={[styles.heightValue, { color: colors.text }]}>
                  {measurements.filter(m => m.type === 'height')[0].value} cm
                </Text>
                <Text style={[styles.heightNote, { color: colors.subtext }]}>
                  Height is tracked for statistical purposes only
                </Text>
              </View>
            ) : (
              <Text style={[styles.noDataText, { color: colors.subtext }]}>
                No height data available. Add your height to track your BMI.
              </Text>
            )}
          </View>
        )}
        
        <View style={styles.historyContainer}>
          <View style={styles.historyHeader}>
            <Text style={[styles.historyTitle, { color: colors.text }]}>History</Text>
          </View>
          
          {measurements.filter(m => m.type === selectedTab).length > 0 ? (
            <ScrollView 
              style={styles.historyScrollView} 
              showsVerticalScrollIndicator={true}
              contentContainerStyle={styles.historyContentContainer}
            >
              {measurements
                .filter(m => m.type === selectedTab)
                .map((measurement, index) => (
                  <View key={measurement.id} style={[styles.historyItem, { borderBottomColor: colors.border }]}>
                    <View style={styles.historyDate}>
                      <Text style={[styles.historyDateText, { color: colors.text }]}>
                        {formatDate(measurement.date)}
                      </Text>
                    </View>
                    <View style={styles.historyValue}>
                      <Text style={[styles.historyValueText, { color: colors.text }]}>
                        {measurement.value} {measurement.unit}
                      </Text>
                    </View>
                    <TouchableOpacity 
                      style={styles.historyDelete}
                      onPress={() => {
                        Alert.alert(
                          'Delete Measurement',
                          'Are you sure you want to delete this measurement?',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { 
                              text: 'Delete', 
                              style: 'destructive',
                              onPress: () => deleteMeasurement(measurement.id)
                            }
                          ]
                        );
                      }}
                    >
                      <FontAwesome5 name="trash-alt" size={16} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                ))}
            </ScrollView>
          ) : (
            <Text style={[styles.noDataText, { color: colors.subtext, textAlign: 'center', marginTop: 20 }]}>
              No history available
            </Text>
          )}
        </View>
      </View>
    );
  };
  
  const renderAddModal = () => (
    <Modal
      visible={addModalVisible}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setAddModalVisible(false)}
    >
      <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
        <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Add Measurement</Text>
          
          <View style={styles.formGroup}>
            <Text style={[styles.formLabel, { color: colors.text }]}>Measurement Type</Text>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              style={styles.typeSelector}
              contentContainerStyle={styles.typeSelectorContent}
            >
              {userMeasurements.map(measure => (
                <TouchableOpacity
                  key={measure.key}
                  style={[
                    styles.typeOption,
                    newEntry.type === measure.key && [styles.activeType, { borderColor: colors.primary }]
                  ]}
                  onPress={() => setNewEntry({
                    ...newEntry,
                    type: measure.key,
                    unit: measure.unit
                  })}
                >
                  <FontAwesome5
                    name={measure.icon}
                    size={16}
                    color={newEntry.type === measure.key ? colors.primary : colors.subtext}
                    style={styles.typeIcon}
                  />
                  <Text
                    style={[
                      styles.typeText,
                      { color: newEntry.type === measure.key ? colors.primary : colors.subtext }
                    ]}
                  >
                    {measure.customName || measure.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          
          <View style={styles.formGroup}>
            <Text style={[styles.formLabel, { color: colors.text }]}>Value</Text>
            <View style={styles.valueInputContainer}>
              <TextInput
                style={[
                  styles.valueInput,
                  { 
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.background
                  }
                ]}
                keyboardType="numeric"
                value={newEntry.value}
                onChangeText={(text) => setNewEntry({ ...newEntry, value: text })}
                placeholder="Enter value"
                placeholderTextColor={colors.subtext}
              />
              
              {newEntry.type === 'weight' && (
                <View style={styles.unitSelector}>
                  <TouchableOpacity
                    style={[
                      styles.unitOption,
                      newEntry.unit === 'kg' && { backgroundColor: colors.primary }
                    ]}
                    onPress={() => setNewEntry({ ...newEntry, unit: 'kg' })}
                  >
                    <Text
                      style={[
                        styles.unitText,
                        { color: newEntry.unit === 'kg' ? 'white' : colors.text }
                      ]}
                    >
                      kg
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.unitOption,
                      newEntry.unit === 'lb' && { backgroundColor: colors.primary }
                    ]}
                    onPress={() => setNewEntry({ ...newEntry, unit: 'lb' })}
                  >
                    <Text
                      style={[
                        styles.unitText,
                        { color: newEntry.unit === 'lb' ? 'white' : colors.text }
                      ]}
                    >
                      lb
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
              
              {newEntry.type !== 'weight' && (
                <View style={styles.unitDisplay}>
                  <Text style={[styles.unitDisplayText, { color: colors.text }]}>
                    {userMeasurements.find(m => m.key === newEntry.type)?.unit}
                  </Text>
                </View>
              )}
            </View>
          </View>
          
          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={[styles.modalButton, styles.cancelButton, { borderColor: colors.border }]}
              onPress={() => setAddModalVisible(false)}
            >
              <Text style={[styles.cancelButtonText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalButton, styles.saveButton, { backgroundColor: colors.primary }]}
              onPress={saveMeasurement}
            >
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
  
  // Add this function to handle tab selection for measurements that have data but might not be currently tracked
  const handleTabSelection = () => {
    // First check if the currently selected tab is valid (is being tracked)
    const trackedMeasurements = userMeasurements.filter(m => m.isTracking);
    
    // If no measurements are tracked but we have measurement data, suggest enabling tracking
    if (trackedMeasurements.length === 0 && measurements.length > 0) {
      const typesWithData = [...new Set(measurements.map(m => m.type))];
      if (typesWithData.length > 0) {
        Alert.alert(
          'Data Available',
          'You have measurement data available but no measurements enabled for tracking. Would you like to enable tracking for your existing data?',
          [
            { text: 'Not Now', style: 'cancel' },
            { 
              text: 'Enable Tracking', 
              onPress: async () => {
                // Enable tracking for all measurement types that have data
                for (const type of typesWithData) {
                  await toggleTrackMeasurement(type as MeasurementType, true);
                }
              }
            }
          ]
        );
      }
      return;
    }
    
    // If selected tab is no longer tracked but we still have data for it
    if (trackedMeasurements.length > 0 && 
        !trackedMeasurements.some(m => m.key === selectedTab) &&
        measurements.some(m => m.type === selectedTab)) {
      // Ask user if they want to re-enable tracking for this measurement
      const measurementName = userMeasurements.find(m => m.key === selectedTab)?.label || selectedTab;
      Alert.alert(
        'Enable Tracking?',
        `You have data for ${measurementName} but tracking is disabled. Would you like to enable tracking for this measurement?`,
        [
          { 
            text: 'Switch to Other Measurement', 
            onPress: () => {
              // Switch to first tracked measurement
              setSelectedTab(trackedMeasurements[0].key);
            }
          },
          { 
            text: 'Enable Tracking', 
            onPress: async () => {
              await toggleTrackMeasurement(selectedTab, true);
            }
          }
        ]
      );
    }
  };
  
  return (
    <>
      <Stack.Screen 
        options={{
          title: "Body Measurements",
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
        }}
      />
      {renderAddModal()}
      
      <Animated.View 
        style={[
          styles.container, 
          { 
            backgroundColor: colors.background,
            opacity: fadeAnim
          }
        ]}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.subtext }]}>
              Loading your measurements...
            </Text>
          </View>
        ) : (
          <ScrollView 
            style={styles.mainScrollView}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.mainScrollContent}
          >
            <LinearGradient
              colors={[colors.primary, colors.secondary || colors.primary]}
              style={styles.header}
            >
              <Text style={styles.headerText}>Body Measurements</Text>
              <Text style={styles.headerSubtext}>Track your progress over time</Text>
            </LinearGradient>
            
            {renderMeasurementTabs()}
            
            <View style={styles.bottomSpacer} />
          </ScrollView>
        )}
        
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: colors.primary }]}
          onPress={() => setAddModalVisible(true)}
        >
          <FontAwesome5 name="plus" size={20} color="white" />
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.manageButton, { backgroundColor: colors.card }]}
          onPress={() => router.push('/measurement-settings')}
        >
          <FontAwesome5 name="cog" size={16} color={colors.primary} style={styles.manageIcon} />
          <Text style={[styles.manageText, { color: colors.text }]}>Manage Measurements</Text>
        </TouchableOpacity>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mainScrollView: {
    flex: 1,
  },
  mainScrollContent: {
    flexGrow: 1,
  },
  bottomSpacer: {
    height: 100, // Space for buttons at the bottom
  },
  header: {
    paddingVertical: 30,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
  headerSubtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginTop: 4,
  },
  content: {
    padding: 16,
  },
  tabsContainer: {
    marginBottom: 16,
  },
  tabs: {
    paddingHorizontal: 4,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginRight: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  activeTab: {
    borderWidth: 1,
  },
  tabIcon: {
    marginRight: 6,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
  },
  chartContainer: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  chartWrapper: {
    alignItems: 'center',
    marginVertical: 8,
  },
  chart: {
    borderRadius: 16,
    marginVertical: 8,
  },
  progressSummary: {
    flexDirection: 'column',
    alignItems: 'center',
    marginHorizontal: 16,
  },
  latestLabel: {
    fontSize: 14,
    marginBottom: 4,
  },
  latestValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  historyContainer: {
    marginTop: 16,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  historyDate: {
    flex: 2,
  },
  historyDateText: {
    fontSize: 14,
  },
  historyValue: {
    flex: 1,
  },
  historyValueText: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'right',
  },
  historyDelete: {
    marginLeft: 16,
    padding: 8,
  },
  addButton: {
    position: 'absolute',
    bottom: 80,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  manageButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    elevation: 2,
  },
  manageIcon: {
    marginRight: 6,
  },
  manageText: {
    fontSize: 14,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  modalContent: {
    width: '100%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  formGroup: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 10,
  },
  typeSelector: {
    marginBottom: 8,
  },
  typeSelectorContent: {
    paddingHorizontal: 4,
  },
  typeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  activeType: {
    borderWidth: 1,
  },
  typeIcon: {
    marginRight: 6,
  },
  typeText: {
    fontSize: 14,
  },
  valueInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  valueInput: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 16,
  },
  unitSelector: {
    flexDirection: 'row',
    marginLeft: 10,
    borderRadius: 8,
    overflow: 'hidden',
  },
  unitOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitText: {
    fontSize: 16,
  },
  unitDisplay: {
    marginLeft: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitDisplayText: {
    fontSize: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  cancelButton: {
    marginRight: 10,
    borderWidth: 1,
  },
  saveButton: {
    marginLeft: 10,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: 'white',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    marginTop: 12,
  },
  emptyState: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 60,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyStateSubText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 30,
  },
  emptyStateButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
  },
  emptyStateButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  noDataText: {
    fontSize: 16,
    fontStyle: 'italic',
  },
  changeValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  latestContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  historyScrollView: {
    maxHeight: 300,
  },
  historyContentContainer: {
    paddingBottom: 16,
  },
  heightContainer: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  heightTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  heightValueContainer: {
    alignItems: 'center',
  },
  heightValue: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  heightNote: {
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  emptyChartContainer: {
    height: 220,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginVertical: 8,
  },
  emptyChartText: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 12,
    marginBottom: 4,
    textAlign: 'center',
  },
  emptyChartSubText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  emptyChartButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  emptyChartButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
}); 