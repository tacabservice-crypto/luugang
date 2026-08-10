import React, { useEffect, useState } from 'react';
import { useAuth } from '../firebase-client';
import { Tournament } from '../types/game';
import TournamentBracket from '../components/TournamentBracket';

const Tournaments: React.FC = () => {
  const { user } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);

  useEffect(() => {
    const fetchTournaments = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/tournaments`);
        if (!response.ok) {
          throw new Error('Failed to fetch tournaments.');
        }
        const data = await response.json();
        setTournaments(data);
      } catch (err: any) {
        setError(err.message || 'An error occurred while fetching tournaments.');
      } finally {
        setLoading(false);
      }
    };

    fetchTournaments();
  }, []);

  const handleRegister = async (tournamentId: string) => {
    if (!user || !user.idToken) {
      setMessage('Please log in to register for a tournament.');
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/tournaments/${tournamentId}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.idToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to register for the tournament.');
      }

      setMessage(data.message || 'Successfully registered for the tournament!');
      // Refresh tournaments list
      const freshResponse = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/tournaments`);
      const freshData = await freshResponse.json();
      setTournaments(freshData);

    } catch (err: any) {
      console.error('Tournament registration error:', err);
      setError(err.message || 'An error occurred during registration.');
    } finally {
      setLoading(false);
    }
  };
  
  if (selectedTournamentId) {
    return (
      <div>
        <button onClick={() => setSelectedTournamentId(null)} className="m-4 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded">
          Back to Tournaments
        </button>
        <TournamentBracket tournamentId={selectedTournamentId} />
      </div>
    );
  }

  if (loading && tournaments.length === 0) {
    return <div className="p-4 text-white">Loading tournaments...</div>;
  }

  return (
    <div className="p-4 bg-gray-800 text-white min-h-screen">
      <h1 className="text-3xl font-bold mb-6">Tournaments</h1>

      {error && <div className="bg-red-500 p-3 rounded mb-4">{error}</div>}
      {message && <div className="bg-green-500 p-3 rounded mb-4">{message}</div>}

      {tournaments.length === 0 && !loading ? (
        <p>No tournaments available for registration at the moment. Please check back later.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {tournaments.map((tournament) => (
            <div key={tournament.id} className="bg-gray-700 p-6 rounded-lg shadow-xl border border-gray-600 cursor-pointer" onClick={() => setSelectedTournamentId(tournament.id)}>
              <h2 className="text-2xl font-bold mb-4 text-purple-400">{tournament.name}</h2>
              <p className="mb-2"><strong>Entry Fee:</strong> ${tournament.entryFee}</p>
              <p className="mb-2"><strong>Prize Pool:</strong> ${tournament.prizePool}</p>
              <p className="mb-2"><strong>Players:</strong> {tournament.players.length} / {tournament.maxPlayers}</p>
              <p className="mb-4"><strong>Starts:</strong> {new Date(tournament.startDate).toLocaleString()}</p>
              <button
                onClick={(e) => { e.stopPropagation(); handleRegister(tournament.id); }}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg transition-colors duration-300"
                disabled={loading || tournament.players.some(p => p.userId === user?.id)}
              >
                {loading ? 'Processing...' : tournament.players.some(p => p.userId === user?.id) ? 'Registered' : 'Register'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Tournaments;
