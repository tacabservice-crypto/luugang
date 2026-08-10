import React, { useEffect, useState } from 'react';
import { Tournament, TournamentMatch } from '../types/game';

interface TournamentBracketProps {
  tournamentId: string;
}

const TournamentBracket: React.FC<TournamentBracketProps> = ({ tournamentId }) => {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTournament = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/tournaments/${tournamentId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch tournament details.');
        }
        const data = await response.json();
        setTournament(data);
      } catch (err: any) {
        setError(err.message || 'An error occurred while fetching tournament details.');
      } finally {
        setLoading(false);
      }
    };

    fetchTournament();

    // Set up SSE for real-time updates
    const eventSource = new EventSource(`${import.meta.env.VITE_API_BASE_URL || ''}/api/updates?userId=tournament_spectator_${tournamentId}`);
    eventSource.addEventListener('tournament_update', (event) => {
      const updatedTournament = JSON.parse(event.data);
      if (updatedTournament.id === tournamentId) {
        setTournament(updatedTournament);
      }
    });
     eventSource.addEventListener('tournament_started', (event) => {
      const updatedTournament = JSON.parse(event.data);
      if (updatedTournament.id === tournamentId) {
        setTournament(updatedTournament);
      }
    });
    eventSource.addEventListener('tournament_ended', (event) => {
        const updatedTournament = JSON.parse(event.data);
        if (updatedTournament.id === tournamentId) {
            setTournament(updatedTournament);
        }
    });

    return () => {
      eventSource.close();
    };
  }, [tournamentId]);

  if (loading) {
    return <div className="p-4 text-white">Loading tournament bracket...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-500">Error: {error}</div>;
  }

  if (!tournament) {
    return <div className="p-4 text-white">Tournament not found.</div>;
  }
  
  const rounds = tournament.matches.reduce((acc, match) => {
    (acc[match.round] = acc[match.round] || []).push(match);
    return acc;
  }, {} as Record<number, TournamentMatch[]>);

  return (
    <div className="p-4 bg-gray-900 text-white min-h-screen">
      <h1 className="text-3xl font-bold mb-2">{tournament.name}</h1>
      <p className="text-lg text-gray-400 mb-6">{tournament.status.replace('_', ' ').toUpperCase()}</p>
      
      <div className="flex space-x-4 overflow-x-auto p-4">
        {Object.keys(rounds).map(roundNumber => (
          <div key={roundNumber} className="flex-shrink-0 w-72">
            <h2 className="text-xl font-semibold mb-4 text-purple-400">Round {roundNumber}</h2>
            <div className="space-y-4">
              {rounds[parseInt(roundNumber, 10)].map(match => (
                <div key={match.id} className="bg-gray-800 rounded-lg p-4 relative">
                  <div className={`flex items-center justify-between p-2 rounded ${match.winnerId === match.player1?.userId ? 'bg-green-600' : ''}`}>
                    <span>{match.player1?.username || 'TBD'}</span>
                    <img src={match.player1?.avatar} alt="" className="w-8 h-8 rounded-full" />
                  </div>
                  <div className="text-center my-2 text-gray-500 text-sm">VS</div>
                  <div className={`flex items-center justify-between p-2 rounded ${match.winnerId === match.player2?.userId ? 'bg-green-600' : ''}`}>
                    <span>{match.player2?.username || 'TBD'}</span>
                     {match.player2?.avatar && <img src={match.player2?.avatar} alt="" className="w-8 h-8 rounded-full" />}
                  </div>
                   {match.status === 'in_progress' && <span className="absolute top-2 right-2 text-xs bg-blue-500 px-2 py-1 rounded">In Progress</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
       {tournament.winnerId && (
        <div className="mt-8 text-center">
            <h2 className="text-2xl font-bold text-yellow-400">Tournament Winner!</h2>
            <div className="flex items-center justify-center mt-4">
                <img src={tournament.players.find(p=>p.userId === tournament.winnerId)?.avatar} alt="" className="w-16 h-16 rounded-full" />
                <p className="ml-4 text-xl">{tournament.players.find(p=>p.userId === tournament.winnerId)?.username}</p>
            </div>
        </div>
      )}
    </div>
  );
};

export default TournamentBracket;
