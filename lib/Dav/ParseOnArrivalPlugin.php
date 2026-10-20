<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Tasks\Dav;

use OCA\DAV\CalDAV\Calendar;
use OCA\Tasks\NaturalLanguage\ArrivalParser;
use OCA\Tasks\NaturalLanguage\UserZone;
use OCP\App\IAppManager;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\IConfig;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;
use Sabre\DAV\ICollection;
use Sabre\DAV\Server;
use Sabre\DAV\ServerPlugin;
use Sabre\VObject\Component\VCalendar;
use Sabre\VObject\Reader;
use Throwable;

/**
 * Fills in a task created by another client (an agent, the phone) from its
 * title before it is stored (docs/NL-DATES-DESIGN.md, "Tasks arriving from
 * anything else").
 *
 * Runs on beforeCreateFile, so only a PUT that creates; an update, a MOVE or
 * a COPY never reaches it. This checks the request; ArrivalParser checks the
 * object. When it changes the task it reports the body as modified, so sabre
 * sends no ETag and the client fetches the stored version.
 *
 * The plugin is added on every /remote.php/dav request, file sync included,
 * and before authentication has run: the user is read inside the handler,
 * and the cheap checks come first.
 */
class ParseOnArrivalPlugin extends ServerPlugin {
	/** Sent by the Tasks web app on all its DAV requests: it parses in the New task box. */
	public const CLIENT_HEADER = 'X-Nextcloud-Tasks-Client';
	/** Per-user app value written by the Tasks settings: '0' turns it off. */
	public const SETTING = 'various_parseNewTasks';
	/** After sabre's CalDAV validation (100), which has turned the body into a string. */
	private const PRIORITY = 110;

	private ?Server $server = null;

	public function __construct(
		private ArrivalParser $arrivalParser,
		private UserZone $userZone,
		private IUserSession $userSession,
		private IAppManager $appManager,
		private IConfig $config,
		private ITimeFactory $timeFactory,
		private LoggerInterface $logger,
		private string $appName = 'tasks',
	) {
	}

	public function getPluginName(): string {
		return 'tasks-parse-on-arrival';
	}

	public function initialize(Server $server): void {
		$this->server = $server;
		$server->on('beforeCreateFile', [$this, 'beforeCreateFile'], self::PRIORITY);
	}

	/**
	 * Never returns false: that would cancel the create.
	 *
	 * @param string $path The new object's path, relative to the DAV root
	 * @param resource|string $data The body; replaced when the task is filled in
	 * @param bool $modified Set when the body was replaced
	 */
	public function beforeCreateFile($path, &$data, ICollection $parent, &$modified): void {
		// A list of the user's own or shared with them; a federated share
		// writes at remote-calendars/ with no user and passes through
		if (!$parent instanceof Calendar || !str_starts_with((string)$path, 'calendars/')) {
			return;
		}
		if ($this->server === null || $this->server->httpRequest->getHeader(self::CLIENT_HEADER) !== null) {
			return;
		}
		try {
			if (is_resource($data)) {
				// Read once; the body goes on as a string either way
				$data = (string)stream_get_contents($data);
			}
			// An event, or anything else that is no task, is not parsed twice
			if (!is_string($data) || stripos($data, 'BEGIN:VTODO') === false) {
				return;
			}
			$user = $this->userSession->getUser();
			if ($user === null
				|| !$this->appManager->isEnabledForUser($this->appName, $user)
				|| $this->config->getUserValue($user->getUID(), $this->appName, self::SETTING, '1') === '0') {
				return;
			}
			$calendar = Reader::read($data);
			if (!$calendar instanceof VCalendar) {
				return;
			}
			$zone = $this->userZone->for($user->getUID());
			if (!$this->arrivalParser->apply($calendar, $zone, $this->timeFactory->now())) {
				return;
			}
			$data = $calendar->serialize();
			$modified = true;
		} catch (Throwable $e) {
			// The task is stored as it arrived
			$this->logger->warning('Could not read the dates of a new task at ' . $path . ': ' . $e->getMessage(), [
				'app' => $this->appName,
				'exception' => $e,
			]);
		}
	}
}
