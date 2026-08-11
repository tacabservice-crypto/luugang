import React, { useState } from 'react';
import { Tournament } from '../../types/game';
import { Trophy, Plus, Trash2, Ban, Users, Calendar, DollarSign, X, Play, Eye } from 'lucide-react';

interface TournamentsTableProps {
  tournaments: Tournament[];
  onCreate: (data: { name: string; entryFee: number; prizePool: number; maxPlayers: number; startDate: string }) => Promise<void>;
  onCancel: (tournamentId: string) => Promise<void>;
  onDelete: (tournamentId: string) => Promise<void>;
  onStart?: (tournamentId: string) => Promise<void>;
}

export const TournamentsTable: React.FC<TournamentsTableProps> = ({
  tournaments,
  onCreate,
  onCancel,
  onDelete,
  onStart,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingPlayersTournament, setViewingPlayersTournament] = useState<Tournament | null>(null);
  const [name, setName] = useState('');
  const [entryFee, setEntryFee] = useState('5');
  const [prizePool, setPrizePool] = useState('100');
  const [maxPlayers, setMaxPlayers] = useState('16');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000); // Default to tomorrow
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await onCreate({
        name: name.trim(),
        entryFee: parseFloat(entryFee) || 0,
        prizePool: parseFloat(prizePool) || 0,
        maxPlayers: parseInt(maxPlayers, 10) || 16,
        startDate,
      });
      setIsModalOpen(false);
      setName('');
    } catch (err: any) {
      setError(err.message || 'Failed to create tournament');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-gray-900 min-h-screen text-white space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-800 p-6 rounded-xl border border-gray-700">
        <div>
          <h2 className="text-2xl font-black text-purple-400 flex items-center gap-2">
            <Trophy className="w-6 h-6 text-yellow-400" /> Tournaments Management
          </h2>
          <p className="text-sm text-gray-400">Create, monitor, cancel, or remove tournaments for players.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold py-2.5 px-4 rounded-xl flex items-center gap-2 cursor-pointer shadow-lg transition-all"
        >
          <Plus className="w-5 h-5" /> Create Tournament
        </button>
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="bg-gray-700/50 text-xs text-gray-400 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Tournament</th>
                <th className="px-6 py-4">Entry / Prize</th>
                <th className="px-6 py-4">Players</th>
                <th className="px-6 py-4">Start Date</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {tournaments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    No tournaments found. Click "Create Tournament" to add one!
                  </td>
                </tr>
              ) : (
                tournaments.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-700/30 transition-colors">
                    <td className="px-6 py-4 font-bold text-white flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-purple-400 shrink-0" />
                      <span>{t.name}</span>
                    </td>
                    <td className="px-6 py-4 font-mono">
                      <span className="text-emerald-400 font-bold">${t.prizePool} Prize</span>
                      <span className="text-gray-400 text-xs block">(${t.entryFee} entry)</span>
                    </td>
                    <td className="px-6 py-4 font-mono">
                      <button
                        onClick={() => setViewingPlayersTournament(t)}
                        className="bg-purple-950/60 hover:bg-purple-900 border border-purple-500/30 text-purple-300 px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Users className="w-3.5 h-3.5 text-purple-400" />
                        <span>{t.players?.length || 0} / {t.maxPlayers}</span>
                        <Eye className="w-3 h-3 text-purple-400 ml-1" />
                      </button>
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-gray-400">
                      {new Date(t.startDate).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-black uppercase ${
                          t.status === 'registration_open'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : t.status === 'in_progress'
                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 animate-pulse'
                            : t.status === 'completed'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}
                      >
                        {t.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {t.status === 'registration_open' && onStart && (
                          <button
                            onClick={() => {
                              if ((t.players?.length || 0) < 2) {
                                alert('At least 2 players must be registered to start the tournament.');
                                return;
                              }
                              if (confirm(`Force start tournament "${t.name}" immediately? Brackets will be created.`)) {
                                onStart(t.id);
                              }
                            }}
                            title="Force Start Tournament Now"
                            className="p-2 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-lg transition-colors cursor-pointer"
                          >
                            <Play className="w-4 h-4 fill-current text-emerald-400" />
                          </button>
                        )}
                        {t.status !== 'completed' && t.status !== 'cancelled' && (
                          <button
                            onClick={() => {
                              if (confirm(`Are you sure you want to cancel "${t.name}"? Registered players will be refunded.`)) {
                                onCancel(t.id);
                              }
                            }}
                            title="Cancel Tournament & Refund"
                            className="p-2 bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 rounded-lg transition-colors cursor-pointer"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (confirm(`Delete tournament "${t.name}" permanently?`)) {
                              onDelete(t.id);
                            }
                          }}
                          title="Delete Tournament"
                          className="p-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE TOURNAMENT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-800 border border-purple-500/30 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 text-white relative">
            <div className="flex items-center justify-between border-b border-gray-700 pb-3">
              <h3 className="text-lg font-black text-purple-400 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-400" /> Create Tournament
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && <div className="bg-red-500/20 border border-red-500/30 text-red-400 p-3 rounded-xl text-xs">{error}</div>}

            <form onSubmit={handleSubmit} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Tournament Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ludo$om Friday Super Cup 🏆"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl p-2.5 text-white outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Entry Fee ($)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    required
                    value={entryFee}
                    onChange={(e) => setEntryFee(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl p-2.5 text-white outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Prize Pool ($)</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    required
                    value={prizePool}
                    onChange={(e) => setPrizePool(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl p-2.5 text-white outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Max Players</label>
                  <select
                    value={maxPlayers}
                    onChange={(e) => setMaxPlayers(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl p-2.5 text-white outline-none focus:border-purple-500"
                  >
                    <option value="4">4 Players</option>
                    <option value="8">8 Players</option>
                    <option value="16">16 Players</option>
                    <option value="32">32 Players</option>
                    <option value="64">64 Players</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Start Date & Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl p-2.5 text-white outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold py-3 rounded-xl cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Create Tournament'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="bg-gray-700 hover:bg-gray-600 text-white font-bold px-4 py-3 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW ENROLLED PLAYERS MODAL */}
      {viewingPlayersTournament && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-800 border border-purple-500/30 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 text-white relative">
            <div className="flex items-center justify-between border-b border-gray-700 pb-3">
              <div>
                <h3 className="text-lg font-black text-purple-400 flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-400" /> Registered Players
                </h3>
                <p className="text-xs text-gray-400">{viewingPlayersTournament.name}</p>
              </div>
              <button
                onClick={() => setViewingPlayersTournament(null)}
                className="text-gray-400 hover:text-white cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {viewingPlayersTournament.players?.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">No players have registered for this tournament yet.</p>
              ) : (
                viewingPlayersTournament.players.map((p, idx) => (
                  <div
                    key={p.userId || idx}
                    className="flex items-center justify-between bg-gray-900/80 border border-gray-700 p-2.5 rounded-xl text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <img
                        src={p.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + p.username}
                        alt=""
                        className="w-8 h-8 rounded-lg bg-gray-800 object-cover"
                      />
                      <span className="font-bold text-white">{p.username}</span>
                    </div>
                    <span className="text-[10px] text-purple-400 font-mono">#{idx + 1} Seed</span>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2">
              <button
                onClick={() => setViewingPlayersTournament(null)}
                className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-2.5 rounded-xl text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
