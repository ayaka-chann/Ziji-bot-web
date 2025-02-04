"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession } from "next-auth/react";
import { useToast } from "@/hooks/use-toast";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	FaPlay,
	FaPause,
	FaStepForward,
	FaStepBackward,
	FaVolumeUp,
	FaHeart,
	FaShareAlt,
	FaSearch,
	FaRandom,
	FaRedo,
	FaMusic,
	FaTrash,
} from "react-icons/fa";
import { FaXmark } from "react-icons/fa6";
import { Slider } from "./ui/slider";
import { Progress } from "./ui/progress";
import { ScrollArea } from "./ui/scroll-area";
import Loading from "./Loading";

export function MusicController() {
	const [socketInstance, setSocketInstance] = useState(null);
	const [voiceChannel, setVoiceChannel] = useState(null);
	const [guildInfo, setGuildInfo] = useState(null);
	const [playerStats, setPlayerStats] = useState({
		currentTrack: null,
		playlist: [],
		isPlaying: false,
		volume: 50,
		duration: {
			current: 0,
			total: 0,
		},
		repeatMode: 0,
		shuffle: false,
	});
	const [searchQuery, setSearchQuery] = useState("");
	const [searchResults, setSearchResults] = useState([]);
	const [showLyrics, setShowLyrics] = useState(false);
	const { data: session, status } = useSession();
	const { toast } = useToast();
	const progressInterval = useRef(null);
	const wsRef = useRef(null);

	const sendCommand = useCallback(
		(command, payload = {}) => {
			if (wsRef.current?.readyState === WebSocket.OPEN) {
				wsRef.current.send(
					JSON.stringify({
						event: command,
						payload: { userID: session?.user?.id, ...payload },
					}),
				);
				toast({
					title: "Command Sent",
					description: `Sent ${command} command`,
				});
			} else {
				toast({
					title: "Error",
					description: "Not connected to voice channel",
					variant: "destructive",
				});
			}
		},
		[session, toast],
	);

	const connectWebSocket = useCallback(() => {
		if (session?.accessToken) {
			const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
			const wsUrl = `${window.location.protocol}//${window.location.host}/api/ws`;
			console.log("WebSocket URL:", wsUrl);
			const ws = new WebSocket(wsUrl);
			wsRef.current = ws;

			ws.onopen = () => {
				console.log("WebSocket connected");
				ws.send(
					JSON.stringify({
						event: "GetVoice",
						payload: session.user.id,
					}),
				);
			};

			ws.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data);
					console.log("Received WebSocket message:", data);

					switch (data.event) {
						case "ReplyVoice":
							setVoiceChannel(data.payload.channel);
							setGuildInfo(data.payload.guild);
							break;

						case "statistics":
							setPlayerStats({
								currentTrack: data.payload.track,
								playlist: data.payload.queue || [],
								isPlaying: !data.payload.paused,
								volume: data.payload.volume,
								duration: {
									current: data.payload.timestamp?.current?.current?.value ?? 0,
									total: data.payload.timestamp?.total ?? 0,
								},
								repeatMode: data.payload.repeatMode,
								shuffle: data.payload.shuffle,
							});
							break;

						default:
							console.log("Unhandled event:", data.event);
					}
				} catch (error) {
					console.error("Error processing WebSocket message:", error);
				}
			};

			ws.onclose = (event) => {
				console.log("WebSocket disconnected:", event);
				toast({
					title: "Disconnected",
					description: `Lost connection to the music bot. Attempting to reconnect... (Code: ${event.code})`,
					variant: "destructive",
				});
				setTimeout(connectWebSocket, 5000); // Attempt to reconnect after 5 seconds
			};

			ws.onerror = (error) => {
				console.error("WebSocket error:", error);
				toast({
					title: "WebSocket Error",
					description:
						"An error occurred with the WebSocket connection. Attempting to reconnect...",
					variant: "destructive",
				});
			};
		}
	}, [session, toast]);

	useEffect(() => {
		connectWebSocket();

		return () => {
			if (wsRef.current?.readyState === WebSocket.OPEN) {
				wsRef.current.close();
			}
		};
	}, [connectWebSocket]);

	useEffect(() => {
		if (playerStats.isPlaying) {
			progressInterval.current = setInterval(() => {
				setPlayerStats((prev) => ({
					...prev,
					duration: {
						...prev.duration,
						current: Math.min(prev.duration.current + 1000, prev.duration.total),
					},
				}));
			}, 1000);
		} else {
			clearInterval(progressInterval.current);
		}

		return () => clearInterval(progressInterval.current);
	}, [playerStats.isPlaying]);

	const handleVolumeCommit = useCallback(
		(value) => {
			sendCommand("volume", { volume: value[0] });
		},
		[sendCommand],
	);

	const handleSearch = useCallback(async () => {
		try {
			const searchUrl = `${
				process.env.NEXT_PUBLIC_WEBSOCKET_URL
			}/api/search?query=${encodeURIComponent(searchQuery)}`;
			const proxyUrl = `/api/proxy?url=${encodeURIComponent(searchUrl)}`;

			const response = await fetch(proxyUrl);

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Search failed");
			}

			const data = await response.json();
			setSearchResults(data);
		} catch (error) {
			console.error("Search error:", error);
			toast({
				title: "Search Error",
				description: error.message || "Failed to perform search. Please try again.",
				variant: "destructive",
			});
		}
	}, [searchQuery, toast]);

	const handleSearchCancel = () => {
		setSearchResults([]);
	};

	const formatTime = (ms) => {
		const seconds = Math.floor((ms / 1000) % 60);
		const minutes = Math.floor((ms / (1000 * 60)) % 60);
		const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
		return [
			hours.toString().padStart(2, "0"),
			minutes.toString().padStart(2, "0"),
			seconds.toString().padStart(2, "0"),
		].join(":");
	};

	if (status === "loading") {
		return <Loading />;
	}

	if (!session) {
		return <p>Please login to control the music bot.</p>;
	}

	return (
		<div className='grid grid-cols-1 md:grid-cols-3 gap-6 p-6'>
			<div className='md:col-span-2 space-y-6'>
				<Card className='backdrop-blur-sm bg-background/80 dark:bg-background/40'>
					<CardHeader>
						<div className='relative'>
							<Input
								type='text'
								placeholder='Search for music...'
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								onKeyPress={(event) => {
									if (event.key === "Enter") {
										return handleSearch();
									}
								}}
								className='pr-10'
							/>
							{searchResults.length <= 0 ? (
								<Button
									size='sm'
									variant='ghost'
									className='absolute right-0 top-1/2 transform -translate-y-1/2'
									onClick={handleSearch}>
									<FaSearch className='h-4 w-4' />
								</Button>
							) : (
								<Button
									size='sm'
									variant='ghost'
									className='absolute right-0 top-1/2 transform -translate-y-1/2'
									onClick={handleSearchCancel}>
									<FaXmark className='h-4 w-4' />
								</Button>
							)}
						</div>
					</CardHeader>
					{searchResults.length > 0 && (
						<CardContent>
							<h3 className='text-lg font-semibold mb-4'>Search Results</h3>
							<ScrollArea className='h-[624px] pr-4'>
								<div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
									{searchResults.map((track, index) => (
										<Card
											key={index}
											className='backdrop-blur-sm bg-background/80 dark:bg-background/40 flex'>
											<img
												src={track.thumbnail || "/placeholder.svg"}
												alt={track.title}
												className='w-24 h-24 object-cover'
											/>
											<div className='flex-1 p-4'>
												<h4 className='font-medium line-clamp-1'>{track.title}</h4>
												<p className='text-sm text-muted-foreground'>{track.duration}</p>
												<div className='flex gap-2 mt-2'>
													<Button
														size='sm'
														variant='ghost'
														onClick={() => sendCommand("play", { trackUrl: track.url })}>
														<FaPlay className='h-4 w-4' />
													</Button>
													<Button
														size='sm'
														variant='ghost'>
														<FaHeart className='h-4 w-4' />
													</Button>
												</div>
											</div>
										</Card>
									))}
								</div>
							</ScrollArea>
						</CardContent>
					)}
				</Card>

				<Card className='backdrop-blur-sm bg-background/80 dark:bg-background/40'>
					<CardHeader>
						<CardTitle>Queue</CardTitle>
					</CardHeader>
					<CardContent>
						<ScrollArea className='h-[576px] pr-4'>
							<div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto'>
								{playerStats.playlist.map((track, index) => (
									<Card
										key={index}
										className='overflow-hidden'>
										<CardContent className='p-0'>
											<img
												src={track.thumbnail || "/placeholder.svg"}
												alt={track.title}
												className='w-full h-32 object-cover'
											/>
										</CardContent>
										<CardHeader className='p-4'>
											<CardTitle className='text-sm line-clamp-1'>{track.title}</CardTitle>
											<CardDescription className='text-xs'>{track.duration}</CardDescription>
										</CardHeader>

										<CardFooter className='p-4 flex justify-between'>
											<Button
												variant='ghost'
												size='icon'
												onClick={() => sendCommand("play", { index })}>
												<FaPlay className='h-4 w-4' />
											</Button>
											<div className='flex gap-2'>
												<Button
													variant='ghost'
													size='icon'>
													<FaTrash className='h-4 w-4' />
												</Button>
												<Button
													variant='ghost'
													size='icon'>
													<FaShareAlt className='h-4 w-4' />
												</Button>
											</div>
										</CardFooter>
									</Card>
								))}
							</div>
						</ScrollArea>
					</CardContent>
				</Card>
			</div>

			<div className='md:col-span-1'>
				<Card className='sticky top-6 backdrop-blur-sm bg-background/80 dark:bg-background/40'>
					<CardHeader>
						<CardTitle>Now Playing {voiceChannel && `in ${voiceChannel.name}`}</CardTitle>
					</CardHeader>
					<CardContent>
						{playerStats.currentTrack ? (
							<div className='space-y-6'>
								<div className='aspect-square relative rounded-lg overflow-hidden'>
									<img
										src={playerStats.currentTrack.thumbnail || session.user?.image_url}
										alt={playerStats.currentTrack.title}
										className='object-cover w-full h-full'
									/>
								</div>

								<div className='space-y-2 text-center'>
									<h3 className='font-semibold line-clamp-1'>{playerStats.currentTrack.title}</h3>
									<p className='text-sm text-muted-foreground'>
										{formatTime(playerStats.duration.current)} /{" "}
										{formatTime(playerStats.duration.total)}
									</p>
								</div>

								<Progress
									value={(playerStats.duration.current / playerStats.duration.total) * 100}
								/>

								<div className='flex justify-center items-center gap-4'>
									<Button
										variant='ghost'
										size='icon'
										onClick={() => sendCommand("back")}>
										<FaStepBackward className='h-4 w-4' />
									</Button>
									<Button
										variant='default'
										size='icon'
										onClick={() => sendCommand("pause")}>
										{playerStats.isPlaying ? (
											<FaPause className='h-4 w-4' />
										) : (
											<FaPlay className='h-4 w-4' />
										)}
									</Button>
									<Button
										variant='ghost'
										size='icon'
										onClick={() => sendCommand("skip")}>
										<FaStepForward className='h-4 w-4' />
									</Button>
								</div>

								<div className='space-y-2'>
									<div className='flex items-center gap-2'>
										<FaVolumeUp className='h-4 w-4' />
										<Slider
											value={[playerStats.volume]}
											onValueChange={handleVolumeCommit}
											max={100}
											step={1}
										/>
									</div>
								</div>

								<div className='flex justify-center gap-2'>
									<Button
										variant={playerStats.shuffle ? "default" : "ghost"}
										size='icon'
										onClick={() => sendCommand("shuffle")}>
										<FaRandom className='h-4 w-4' />
									</Button>
									<Button
										variant={playerStats.repeatMode !== 0 ? "default" : "ghost"}
										size='icon'
										onClick={() => sendCommand("loop", { mode: (playerStats.repeatMode + 1) % 3 })}>
										<FaRedo className='h-4 w-4' />
									</Button>
									<Button
										variant={showLyrics ? "default" : "ghost"}
										size='icon'
										onClick={() => setShowLyrics(!showLyrics)}>
										<FaMusic className='h-4 w-4' />
									</Button>
								</div>

								{showLyrics && playerStats.currentTrack.lyrics && (
									<ScrollArea className='h-[200px]'>
										<div className='space-y-2'>
											<h4 className='font-semibold'>Lyrics</h4>
											<p className='whitespace-pre-line text-sm'>
												{playerStats.currentTrack.lyrics?.plainLyrics}
											</p>
										</div>
									</ScrollArea>
								)}
							</div>
						) : (
							<div className='text-center text-muted-foreground'>No track currently playing</div>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
