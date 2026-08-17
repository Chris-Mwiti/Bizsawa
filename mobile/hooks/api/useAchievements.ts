import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';

export interface Achievement {
  id: number;
  title: string;
  description: string | null;
  earned: boolean;
  earnedAt: string | null;
  createdAt: string;
}

export function useAchievements() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { authTokens } = useAuth();

  const fetchAchievements = async () => {
    if (!authTokens?.access) return;
    setIsLoading(true);
    try {
      const response = await api.get('/achievements');
      setAchievements(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to load achievements');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAchievements();
  }, [authTokens?.access]);

  const addAchievement = async (title: string, description?: string) => {
    try {
      const response = await api.post('/achievements', { title, description });
      setAchievements([response.data, ...achievements]);
      return response.data;
    } catch (err) {
      throw new Error('Failed to add achievement');
    }
  };

  const toggleAchievement = async (id: number, earned: boolean) => {
    try {
      const response = await api.patch(`/achievements/${id}`, { earned });
      setAchievements(achievements.map((a) => (a.id === id ? response.data : a)));
    } catch (err) {
      throw new Error('Failed to update achievement');
    }
  };

  const deleteAchievement = async (id: number) => {
    try {
      await api.delete(`/achievements/${id}`);
      setAchievements(achievements.filter((a) => a.id !== id));
    } catch (err) {
      throw new Error('Failed to delete achievement');
    }
  };

  return {
    achievements,
    isLoading,
    error,
    refetch: fetchAchievements,
    addAchievement,
    toggleAchievement,
    deleteAchievement,
  };
}
