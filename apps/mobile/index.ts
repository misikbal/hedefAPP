import 'expo-router/entry';
import { registerWidget } from './src/widget/register';

// Android ana ekran widget'ının headless görevi (Expo Go ve web'de hiçbir şey yapmaz).
registerWidget();
