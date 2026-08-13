/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X, ArrowUpRight, ArrowDownLeft, Wallet, ShieldAlert, CheckCircle, RefreshCw, Check, Phone } from 'lucide-react';
import { UserProfile, WalletTransaction, Agent, PlayerAgentRequest } from '../types/game';
import { useLanguage } from '../context/LanguageContext';
import { formatCurrency } from '../utils/number';
import { userErrorMessage } from '../utils/userError';

interface WalletModalProps {
  user: UserProfile;
  onClose: () => void;
  onBalanceUpdated: () => void;
}

const DEPOSIT_PHONE_NUMBER = '907243775'; // Fallback admin number
const cityOnly = (location?: string) => location?.split(',')[0]?.trim() || 'N/A';

export default function WalletModal({ user, onClose, onBalanceUpdated }: WalletModalProps) {
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'history'>('deposit');
  const [amount, setAmount] = useState('');
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [selectedTx, setSelectedTx] = useState<WalletTransaction | null>(null);
  const [error, setError] = useState('');
  
  const [phone, setPhone] = useState('');
  const [senderPhone, setSenderPhone] = useState('');

  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [linkedAgentId, setLinkedAgentId] = useState(user.linkedAgentId || '');
  const [profileLoading, setProfileLoading] = useState(true);
  
  const [provider, setProvider] = useState<'evc' | 'edahab' | 'sahal' | 'zaad' | 'premier'>('evc');
  const [paymentSettings, setPaymentSettings] = useState<Record<string, any>>({});
  const [apiProcessing, setApiProcessing] = useState(false);
  const [apiMessage, setApiMessage] = useState<string>('');
  const [apiError, setApiError] = useState<string>('');

  const [ussdString, setUssdString] = useState('');
  const [confirmationRequested, setConfirmationRequested] = useState(false);
  const [confirmationLoading, setConfirmationLoading] = useState(false);
  const [withdrawPreviewVisible, setWithdrawPreviewVisible] = useState(false);
  const [withdrawQuote, setWithdrawQuote] = useState<{ fee: number; netAmount: number; feeRate: number; playedPaidGame: boolean } | null>(null);
  const [depositAwaitingConfirmation, setDepositAwaitingConfirmation] = useState(false);
  const providerDetails = {
    evc: { label: 'EVC Plus', placeholder: 'e.g. 061XXXXXXX', hint: 'Hormuud • 061' },
    edahab: { label: 'eDahab', placeholder: 'e.g. 065XXXXXXX', hint: 'Somtel • USSD *110#' },
    sahal: { label: 'SAHAL', placeholder: 'e.g. 090XXXXXXX', hint: 'Golis • 090' },
    zaad: { label: 'ZAAD', placeholder: 'e.g. 063XXXXXXX', hint: 'Telesom • 063' },
    premier: { label: 'Premier Card', placeholder: 'Enter card/account number', hint: 'Card payment' },
  } as const;

  useEffect(() => {
    const fetchPrerequisites = async () => {
      let currentLinkedAgentId = user.linkedAgentId || '';
      try {
        const profileRes = await fetch(`/api/users/${user.id}`);
        if (profileRes.ok) {
          const currentProfile: UserProfile = await profileRes.json();
          currentLinkedAgentId = currentProfile.linkedAgentId || '';
          setLinkedAgentId(currentLinkedAgentId);
        }
      } catch (err) {
        console.error('Failed to refresh wallet profile', err);
      } finally {
        setProfileLoading(false);
      }
      try {
        const settingsRes = await fetch('/api/payment/settings');
        if (settingsRes.ok) setPaymentSettings(await settingsRes.json());
      } catch (err) {
        console.error('Failed to load admin payment settings', err);
      }
      // Fetch agents for deposit and withdraw tabs
      if (activeTab === 'deposit' || activeTab === 'withdraw') {
        try {
          const agentsRes = await fetch(`/api/agents?location=${user.location || ''}`);
          if (agentsRes.ok) {
            const data: Agent[] = await agentsRes.json();
            if (currentLinkedAgentId) {
              const linkedAgent = data.find(a => a.id === currentLinkedAgentId);
              if (linkedAgent) {
                setAgents([linkedAgent]);
              } else {
                setAgents([]);
                setError(language === 'so'
                  ? 'Agent-ka koontadan ku xiran hadda ma shaqeynayo ama waa la waayey. Fadlan la xiriir admin-ka.'
                  : 'The agent assigned to this account is inactive or unavailable. Please contact an administrator.');
              }
              setSelectedAgentId(currentLinkedAgentId);
            } else {
              setAgents([]);
              setSelectedAgentId('');
            }
          }
        } catch (err) {
          console.error('Failed to load agents', err);
        }
      }
      // Fetch transactions for the history tab
      if (activeTab === 'history') {
        try {
          const response = await fetch(`/api/wallet/transactions/${user.id}`);
          if (response.ok) {
            const data = await response.json();
            setTransactions(data);
          }
        } catch (err) {
          console.error('Failed to load transaction history', err);
        }
      }
    };
    fetchPrerequisites();
  }, [user.id, user.location, activeTab]);

  const handleRequestConfirmation = async () => {
    if (confirmationLoading || confirmationRequested) return;
    setConfirmationLoading(true);
    setError('');
    try {
        const response = await fetch('/api/wallet/request-manual-confirmation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: user.id,
                // Send the agent actually selected in the wallet. The server still
                // gives a promo-linked agent priority and rejects mismatches.
                agentId: linkedAgentId || undefined,
                amount: parseFloat(amount),
                phone: activeTab === 'withdraw' ? phone : (linkedAgentId
                  ? agents.find(a => a.id === selectedAgentId)?.phone
                  : paymentSettings[provider]?.accountNumber || DEPOSIT_PHONE_NUMBER),
                senderPhone: activeTab === 'deposit' ? senderPhone : undefined,
                provider: provider,
                transactionType: activeTab,
            }),
        });
        const data = await response.json();
        if (response.ok) {
            setConfirmationRequested(true);
            if (onBalanceUpdated) {
              onBalanceUpdated();
            }
            setTimeout(() => {
              onClose();
            }, 2000);
        } else {
            setError(userErrorMessage(data.error, 'The request could not be submitted.'));
        }
    } catch (err) {
        setError('An unexpected error occurred. Please try again.');
    } finally {
        setConfirmationLoading(false);
    }
  };

  const handleGenerateUssd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setUssdString('');
    setConfirmationRequested(false);
    setWithdrawPreviewVisible(false);

    const amtFloat = parseFloat(amount);
    if (isNaN(amtFloat) || amtFloat <= 0) {
      setError(language === 'so' ? 'Fadlan geli lacag sax ah oo togan.' : 'Please enter a valid positive amount.');
      return;
    }

    if (activeTab === 'deposit') {
      if (linkedAgentId && !selectedAgentId) {
        setError('Please select an agent to deposit to.');
        return;
      }
      if (!senderPhone.trim()) {
        setError('Please enter your phone number (sending from).');
        return;
      }
    } else { // withdraw
      if (linkedAgentId && !selectedAgentId) {
        setError('Please select an agent to withdraw from.');
        return;
      }
      if (amtFloat > user.balance) {
        setError('Insufficient balance for this withdrawal.');
        return;
      }
      if (amtFloat < 2) {
        setError('Minimum withdrawal amount is $2.');
        return;
      }
      if (!phone.trim()) {
        setError('Please enter the phone number for the withdrawal.');
        return;
      }
      try {
        const quoteResponse = await fetch(`/api/wallet/withdrawal-quote/${user.id}?amount=${encodeURIComponent(amtFloat)}`);
        const quote = await quoteResponse.json();
        if (!quoteResponse.ok) {
          setError(userErrorMessage(quote.error, 'Withdrawal is not available for this amount.'));
          return;
        }
        setWithdrawQuote(quote);
        setWithdrawPreviewVisible(true);
      } catch (error) {
        setError(userErrorMessage(error, 'Withdrawal details could not be calculated.'));
      }
      return;
    }
      
    const selectedAgent = agents.find(a => a.id === selectedAgentId);
    let targetPhone = activeTab === 'deposit'
      ? (linkedAgentId ? selectedAgent?.phone : paymentSettings[provider]?.accountNumber || DEPOSIT_PHONE_NUMBER)
      : phone;

    if (activeTab === 'deposit' && !targetPhone) {
        setError("The selected agent does not have a phone number configured. Please choose another agent.");
        return;
    }

    let code = '';
    switch (provider) {
      case 'evc': code = `*712*${targetPhone}*${amtFloat}#`; break;
      case 'sahal': code = `*883*${targetPhone}*${amtFloat}#`; break;
      case 'edahab': code = `*110*${targetPhone}*${amtFloat}#`; break;
      case 'zaad': code = `*880*${targetPhone}*${amtFloat}#`; break;
      case 'premier':
        setError('Premier Card processing will be available after card payment configuration is completed.');
        return;
      default: setError('Unknown provider.'); return;
    }

    setUssdString(code);
  };
  
  const resetForm = () => {
    setUssdString('');
    setAmount('');
    setError('');
    setApiError('');
    setApiMessage('');
    setConfirmationRequested(false);
    setDepositAwaitingConfirmation(false);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-white/5 backdrop-blur-xl border-t sm:border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden text-white flex flex-col max-h-[90vh]">
        
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-black/10">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-blue-400" />
            <h2 className="font-extrabold text-lg text-white">{t('walletTitle')}</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg transition-all cursor-pointer">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 m-4 rounded-xl flex flex-col space-y-1 relative shadow-lg shadow-blue-500/10">
          <div className="absolute right-4 top-4 bg-white/15 px-2 py-1 rounded-md text-[10px] uppercase font-extrabold tracking-widest text-white/90">
            Escrow Secured
          </div>
          <span className="text-xs text-white/85 font-semibold tracking-wider uppercase">{t('availableBalance')}</span>
          <span className="text-3xl font-black font-mono">{formatCurrency(user.balance)}</span>
        </div>

        <div className="grid grid-cols-3 gap-1 px-4 text-sm font-bold border-b border-white/10">
          {(['deposit', 'withdraw', 'history'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); resetForm(); }}
              className={`py-3 text-center border-b-2 capitalize transition-all cursor-pointer ${
                activeTab === tab
                  ? 'border-blue-400 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {tab === 'deposit' ? t('deposit') : tab === 'withdraw' ? t('withdraw') : t('history')}
            </button>
          ))}
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {activeTab !== 'history' ? (
             ((activeTab === 'withdraw' && withdrawPreviewVisible) || (activeTab === 'deposit' && ussdString)) ? (
                <div className="py-6 text-center space-y-4 animate-in fade-in duration-300">
                    <h3 className="text-sm font-black text-yellow-400 uppercase tracking-widest">
                        {activeTab === 'withdraw' ? 'Withdrawal Request' : 'Deposit Code'}
                    </h3>
                    <p className="text-xs text-slate-300 font-semibold leading-relaxed px-4">
                      {activeTab === 'deposit' 
                        ? 'Your deposit code is ready. Tap Dir to open the USSD dialer.'
                        : 'Please review the details below before submitting your withdrawal request.'}
                    </p>

                    {activeTab === 'deposit' && ussdString && (
                       <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                        {!depositAwaitingConfirmation ? (
                          <>
                            <a href={`tel:${ussdString}`} onClick={() => setDepositAwaitingConfirmation(true)} className="w-full inline-flex items-center justify-center bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-black text-sm py-3 px-4 rounded-xl shadow gap-2">
                              <Phone className="w-4 h-4" /> Dir
                            </a>
                            <button type="button" onClick={() => { setUssdString(''); }} className="bg-gray-800 text-white font-black text-xs py-3 px-6 rounded-xl">Edit Details</button>
                          </>
                        ) : (
                          <>
                            {!confirmationRequested ? (
                              <>
                                <p className="text-xs text-slate-300 font-semibold">After sending, press Please Confirm to notify admin.</p>
                                <button onClick={handleRequestConfirmation} disabled={confirmationLoading} className="w-full bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-black text-sm py-3 px-4 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer">
                                  {confirmationLoading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Submitting...</> : 'Please Confirm'}
                                </button>
                              </>
                            ) : (
                              <div className="bg-green-500/20 border border-green-500/30 text-green-400 p-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 animate-in fade-in">
                                <CheckCircle className="w-4 h-4 shrink-0" />
                                <span>{language === 'so' ? 'Codsiga waa loo diray maamulka. Waxaa dib loogu laabanayaa bogga hore...' : 'Request submitted for review. Returning home...'}</span>
                              </div>
                            )}
                          </>
                        )}
                       </div>
                    )}
                    
                    {activeTab === 'withdraw' && (
                       <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                         <div className="bg-black/40 border border-white/10 rounded-xl p-4 text-left text-sm text-white space-y-2">
                           <div className="flex justify-between"><span>Amount:</span><span>${parseFloat(amount).toFixed(2)}</span></div>
                           <div className={`flex justify-between ${withdrawQuote?.playedPaidGame ? 'text-emerald-300' : 'text-amber-300'}`}><span>{withdrawQuote?.playedPaidGame ? 'Player withdrawal fee (0%):' : 'No-play fee (10%):'}</span><span>-${Number(withdrawQuote?.fee || 0).toFixed(2)}</span></div>
                           <div className="flex justify-between border-t border-white/10 pt-2 font-black text-emerald-300"><span>You receive:</span><span>${Number(withdrawQuote?.netAmount || 0).toFixed(2)}</span></div>
                           <div className="flex justify-between"><span>Phone:</span><span>{phone}</span></div>
                           <div className="flex justify-between"><span>Provider:</span><span className="uppercase">{provider}</span></div>
                         </div>
                         {confirmationRequested ? (
                            <div className="bg-green-500/20 border border-green-500/30 text-green-400 p-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 animate-in fade-in">
                              <CheckCircle className="w-4 h-4 shrink-0" />
                              <span>{language === 'so' ? 'Codsiga waa loo diray maamulka. Waxaa dib loogu laabanayaa bogga hore...' : 'Request submitted. Admin will review. Returning home...'}</span>
                            </div>
                         ) : (
                            <>
                              <button onClick={handleRequestConfirmation} disabled={confirmationLoading} className="w-full bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-black text-sm py-3 px-4 rounded-xl disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2">
                                {confirmationLoading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Submitting...</> : 'Please Confirm'}
                              </button>
                              <button type="button" onClick={onClose} className="bg-gray-800 text-white font-black text-xs py-3 px-6 rounded-xl cursor-pointer">Go back home</button>
                            </>
                         )}
                       </div>
                    )}
                </div>
             ) : (
              <form className="space-y-4" onSubmit={handleGenerateUssd}>
                
                {!profileLoading && (activeTab === 'deposit' || activeTab === 'withdraw') && linkedAgentId && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                        {activeTab === 'deposit' ? 'Deposit to Agent' : 'Withdraw from Agent'}
                      </label>
                      {linkedAgentId && (
                        <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2.5 py-0.5 rounded-full font-bold">
                          {language === 'so' ? 'Agent-kaaga gaarka ah (Locked)' : 'Assigned Agent (Locked)'}
                        </span>
                      )}
                    </div>
                    <select
                      value={selectedAgentId}
                      onChange={(e) => !linkedAgentId && setSelectedAgentId(e.target.value)}
                      disabled={!!linkedAgentId}
                      className={`w-full bg-black/40 border rounded-xl px-4 py-2.5 text-sm text-white ${
                        linkedAgentId
                          ? 'border-purple-500/40 bg-purple-950/20 text-purple-200 cursor-not-allowed opacity-90'
                          : 'border-white/10'
                      }`}
                    >
                      {agents.length === 0 && (
                        <option value="">
                          {linkedAgentId ? 'Assigned agent unavailable' : 'Loading agent...'}
                        </option>
                      )}
                      {agents.map(agent => (
                        <option key={agent.id} value={agent.id}>
                          {agent.username} ({cityOnly(agent.location)})
                        </option>
                      ))}
                    </select>
                    {linkedAgentId && (
                      <p className="text-[11px] text-purple-300/80 italic">
                        {language === 'so'
                          ? 'Koontadaada waxay ku xiran tahay agent-ka promo code-kiisa aad adeegsatay.'
                          : 'Your account is locked to the agent whose promo code you registered with.'}
                      </p>
                    )}
                  </div>
                )}

                {!profileLoading && (activeTab === 'deposit' || activeTab === 'withdraw') && !linkedAgentId && (
                  <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3">
                    <p className="text-xs font-bold text-blue-300 uppercase tracking-wider">
                      {language === 'so' ? 'Admin Review' : 'Admin Review'}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-300">
                      {language === 'so'
                        ? 'Koontadan agent kuma xirna. Codsigaaga admin-ka ayaa si toos ah u hubinaya.'
                        : 'This account is not linked to an agent. Your request will be reviewed directly by an administrator.'}
                    </p>
                  </div>
                )}
                
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Payment Provider</label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                    {(Object.keys(providerDetails) as Array<keyof typeof providerDetails>).map((p) => (
                      <button key={p} type="button" onClick={() => setProvider(p)} className={`min-h-14 p-2 rounded-xl text-center border transition-all ${provider === p ? (p === 'premier' ? 'bg-amber-500/10 border-amber-400' : 'bg-white/10 border-blue-400') : 'bg-black/30 border-white/5'}`}>
                        <span className={`block text-xs font-black uppercase ${p === 'premier' ? 'text-amber-300' : ''}`}>{providerDetails[p].label}</span>
                        <span className="mt-0.5 block text-[8px] text-slate-500">{providerDetails[p].hint}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {activeTab === 'withdraw' && (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">{provider === 'premier' ? 'Premier Card / Account Number' : 'Withdrawal Phone Number'}</label>
                    <input type={provider === 'premier' ? 'text' : 'tel'} required placeholder={providerDetails[provider].placeholder} value={phone} onChange={(e) => setPhone(e.target.value)} className={`w-full bg-black/40 rounded-xl px-4 py-2.5 text-sm text-white ${provider === 'premier' ? 'border border-amber-400/40' : 'border border-white/10'}`} />
                  </div>
                )}
                 
                {activeTab === 'deposit' && (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">{provider === 'premier' ? 'Premier Card / Account Number' : 'Your Phone Number (Sending From)'}</label>
                    <input type={provider === 'premier' ? 'text' : 'tel'} required placeholder={providerDetails[provider].placeholder} value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)} className={`w-full bg-black/40 rounded-xl px-4 py-2.5 text-sm text-white ${provider === 'premier' ? 'border border-amber-400/40' : 'border border-white/10'}`} />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Amount ($)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                    <input type="number" step="0.01" min={activeTab === 'withdraw' ? 2 : 0.01} required placeholder={activeTab === 'withdraw' ? 'Minimum $2' : 'Enter amount'} value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl pl-8 pr-4 py-2.5 text-lg font-black text-white" />
                  </div>
                  {activeTab === 'withdraw' && <p className="text-[11px] text-amber-300">Minimum withdrawal is $2. Deposits are withdrawable; the $1 welcome bonus unlocks after $5 in approved deposits. A 10% fee applies only until you complete a paid game; regular players pay no withdrawal fee.</p>}
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {[5, 10, 25, 50].map((preset) => (
                    <button key={preset} type="button" onClick={() => setAmount(preset.toString())} className="bg-black/30 border border-white/10 hover:border-blue-400 text-xs font-bold py-2 rounded-lg">
                      +${preset}
                    </button>
                  ))}
                </div>

                <button type="submit" className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-extrabold text-sm py-3 px-4 rounded-xl">
                  {activeTab === 'deposit' ? 'Generate Deposit Code' : 'Generate Withdraw Code'}
                </button>
              </form>
            )
          ) : (
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Transaction History</h3>
              {transactions.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-xs">No previous transactions.</div>
              ) : (
                <div className="space-y-2 max-h-[35vh] overflow-y-auto pr-1">
                  {transactions.map((tx) => (
                    <div key={tx.id} onClick={() => setSelectedTx(tx)} className="bg-black/30 border border-white/5 p-3 rounded-xl flex items-center justify-between text-xs cursor-pointer hover:bg-black/50">
                      <div>
                        <p className="font-bold">{tx.description}</p>
                        <p className="text-[10px] text-slate-500">{new Date(tx.timestamp).toLocaleString()}</p>
                      </div>
                      <span className={`font-black ${tx.type === 'deposit' ? 'text-green-400' : 'text-red-400'}`}>{tx.type === 'deposit' ? '+' : '-'}{formatCurrency(tx.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {selectedTx && (
          <TransactionDetailModal transaction={selectedTx} onClose={() => setSelectedTx(null)} />
        )}
      </div>
    </div>
  );
}

function TransactionDetailModal({ transaction, onClose }: { transaction: WalletTransaction, onClose: () => void }) {
  const { t } = useLanguage();
  const isDeposit = transaction.type === 'deposit';

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-gray-900 border border-white/10 rounded-2xl shadow-2xl text-white animate-in fade-in zoom-in-95 duration-300">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="font-bold text-lg">{t('transactionDetails')}</h3>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex justify-between items-center pb-4 border-b border-dashed border-white/10">
            <span className="text-sm text-slate-400">{t('amount')}</span>
            <span className={`text-2xl font-black ${isDeposit ? 'text-green-400' : 'text-red-400'}`}>
              {isDeposit ? '+' : '-'}{formatCurrency(transaction.amount)}
            </span>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">{t('description')}</span>
              <span className="font-semibold text-right">{transaction.description}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">{t('date')}</span>
              <span className="font-semibold">{new Date(transaction.timestamp).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">{t('time')}</span>
              <span className="font-semibold">{new Date(transaction.timestamp).toLocaleTimeString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">{t('transactionType')}</span>
              <span className={`font-semibold capitalize ${isDeposit ? 'text-green-400' : 'text-red-400'}`}>{transaction.type}</span>
            </div>
             <div className="flex justify-between">
              <span className="text-slate-400">{t('status')}</span>
              <span className="font-semibold capitalize">{transaction.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">{t('transactionId')}</span>
              <span className="font-mono text-xs text-slate-500">{transaction.id}</span>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-black/20 rounded-b-2xl">
           <button onClick={onClose} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg transition-all">
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
}
