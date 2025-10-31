import React, { useEffect, useState, useCallback } from 'react';
import { HelpCircle, Info } from 'lucide-react';
import type { ApplicationSettings } from '../types/global';
import { SETTINGS } from '../utils/constants';

interface ApplicationSettingsPaneProps {
  applicationSettings: ApplicationSettings | null;
  isLoadingApplicationSettings: boolean;
  applicationSettingsError: string | null;
  saveApplicationSettings: (settings: ApplicationSettings) => Promise<void>;
  applicationDefaults: ApplicationSettings;
}

const ApplicationSettingsPane: React.FC<ApplicationSettingsPaneProps> = ({
  applicationSettings,
  isLoadingApplicationSettings,
  applicationSettingsError,
  saveApplicationSettings,
  applicationDefaults,
}) => {
  // Local state for application settings form inputs
  const [uiTheme, setUiTheme] = useState<string>(
    SETTINGS.defaults.application.uiTheme
  );
  const [isSavingApplication, setIsSavingApplication] = useState(false);
  const [applicationSaveError, setApplicationSaveError] = useState<
    string | null
  >(null);

  // Update local state when applicationSettings changes
  useEffect(() => {
    const defaults = SETTINGS.defaults.application;
    if (applicationSettings) {
      setUiTheme(
        applicationSettings.uiTheme ??
          applicationDefaults.uiTheme ??
          defaults.uiTheme
      );
    } else {
      // Set default values when no application settings
      setUiTheme(
        applicationDefaults.uiTheme ??
          defaults.uiTheme
      );
    }
    // Clear any previous save errors when settings load
    setApplicationSaveError(null);
  }, [applicationSettings, applicationDefaults]);

  // Save application settings
  const saveApplicationSettingsCallback = useCallback(
    async (newSettings: Partial<ApplicationSettings>) => {
      setIsSavingApplication(true);
      setApplicationSaveError(null);

      try {
        const updatedSettings = {
          ...applicationSettings,
          ...newSettings,
        };
        await saveApplicationSettings(updatedSettings);
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Failed to save application settings';
        setApplicationSaveError(errorMessage);
        console.error('Error saving application settings:', error);
      } finally {
        setIsSavingApplication(false);
      }
    },
    [applicationSettings, saveApplicationSettings]
  );

  // Application settings handlers
  const handleUiThemeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setUiTheme(e.target.value);
  };

  // Application save button handler
  const handleSaveApplicationSettings = () => {
    saveApplicationSettingsCallback({
      uiTheme,
    });
  };

  // Check if application settings have unsaved changes
  const defaults = SETTINGS.defaults.application;
  const hasUnsavedApplicationChanges =
    uiTheme !==
      (applicationSettings?.uiTheme ??
        applicationDefaults.uiTheme ??
        defaults.uiTheme);

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 h-fit">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Application Settings
        </h2>
        <span className="text-sm text-gray-500 dark:text-gray-400">Global</span>
      </div>

      <div className="space-y-6">
        {isLoadingApplicationSettings ? (
          <div className="flex items-center justify-center py-4">
            <div className="text-gray-500 dark:text-gray-400">Loading application settings...</div>
          </div>
        ) : (
          <>
            {/* Error Display */}
            {(applicationSettingsError || applicationSaveError) && (
              <div className="bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-800 rounded-md p-4">
                <div className="text-red-800 dark:text-red-200 font-medium">
                  Error with application settings
                </div>
                <div className="text-red-600 dark:text-red-300 text-sm mt-1">
                  {applicationSaveError || applicationSettingsError}
                </div>
              </div>
            )}

            {/* Application Settings Form */}
            <div className="space-y-6">
              {/* UI Theme Selection */}
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <label
                    htmlFor="uiTheme"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    UI Theme
                  </label>
                  <div
                    className="relative group"
                    title="Choose the visual theme for the application. Auto follows your system theme preference."
                  >
                    <HelpCircle className="w-4 h-4 text-gray-400 dark:text-gray-500 cursor-help" />
                  </div>
                </div>
                <select
                  id="uiTheme"
                  value={uiTheme}
                  onChange={handleUiThemeChange}
                  disabled={isLoadingApplicationSettings || isSavingApplication}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 disabled:bg-gray-50 dark:disabled:bg-gray-600 disabled:text-gray-500 dark:disabled:text-gray-400"
                >
                  <option value="Light">Light</option>
                  <option value="Dark">Dark</option>
                  <option value="Auto">Auto (System)</option>
                </select>
              </div>
            </div>

            {/* Save Application Settings Button */}
            <div className="flex items-center justify-between">
              <button
                onClick={handleSaveApplicationSettings}
                disabled={
                  isLoadingApplicationSettings ||
                  isSavingApplication ||
                  !hasUnsavedApplicationChanges
                }
                className="px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save Application Settings
              </button>

              <div className="flex items-center">
                {/* Save Status */}
                {isSavingApplication && (
                  <div className="flex items-center text-sm text-blue-600 dark:text-blue-400 mr-3">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 dark:border-blue-400 mr-2"></div>
                    Saving application settings...
                  </div>
                )}

                {/* Info Icon for Application Settings */}
                {!isLoadingApplicationSettings && (
                  <div
                    className="relative group"
                    title={
                      `Current Settings:\n${
                        applicationSettings
                          ? JSON.stringify(applicationSettings, null, 2)
                          : 'No application settings file found or loaded.\n(Using default values or awaiting load)'
                      }\n\n` +
                      `Settings are stored in the application user data directory`
                    }
                  >
                    <Info className="w-5 h-5 text-gray-500 dark:text-gray-400 cursor-help hover:text-gray-700 dark:hover:text-gray-300" />
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ApplicationSettingsPane;
