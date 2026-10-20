<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Tasks\Tests\Dav;

use DateTimeImmutable;
use DateTimeZone;
use OCA\DAV\CalDAV\Calendar;
use OCA\Tasks\Dav\ParseOnArrivalPlugin;
use OCA\Tasks\NaturalLanguage\ArrivalParser;
use OCA\Tasks\NaturalLanguage\UserZone;
use OCP\App\IAppManager;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\IConfig;
use OCP\IUser;
use OCP\IUserSession;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
use Sabre\DAV\Server;
use Sabre\HTTP\Request;

/**
 * The request checks of the arrival plugin, with the dav app's classes and
 * Nextcloud's public interfaces loaded from the server image.
 */
class ParseOnArrivalPluginTest extends TestCase {
	private const PATH = 'calendars/admin/personal/new.ics';

	/** @var ArrivalParser&MockObject */
	private ArrivalParser $arrival;
	/** @var LoggerInterface&MockObject */
	private LoggerInterface $logger;
	private ParseOnArrivalPlugin $plugin;

	public static function setUpBeforeClass(): void {
		require_once '/usr/src/nextcloud/lib/composer/autoload.php';
		require_once '/usr/src/nextcloud/apps/dav/composer/autoload.php';
	}

	protected function setUp(): void {
		$this->arrival = $this->createMock(ArrivalParser::class);
		$this->logger = $this->createMock(LoggerInterface::class);
		$zone = $this->createMock(UserZone::class);
		$zone->method('for')->willReturn(new DateTimeZone('America/Phoenix'));
		$user = $this->createMock(IUser::class);
		$user->method('getUID')->willReturn('admin');
		$session = $this->createMock(IUserSession::class);
		$session->method('getUser')->willReturn($user);
		$apps = $this->createMock(IAppManager::class);
		$apps->method('isEnabledForUser')->willReturn(true);
		$config = $this->createMock(IConfig::class);
		$config->method('getUserValue')->willReturnArgument(3);
		$time = $this->createMock(ITimeFactory::class);
		$time->method('now')->willReturn(new DateTimeImmutable('2026-10-21 21:30', new DateTimeZone('UTC')));

		$this->plugin = new ParseOnArrivalPlugin($this->arrival, $zone, $session, $apps, $config, $time, $this->logger);
		$server = $this->createMock(Server::class);
		$server->httpRequest = new Request('PUT', '/remote.php/dav/' . self::PATH);
		$this->plugin->initialize($server);
	}

	private function create(string $body): string {
		$modified = false;
		$this->plugin->beforeCreateFile(self::PATH, $body, $this->createMock(Calendar::class), $modified);
		return $body;
	}

	public function testATaskIsRead(): void {
		$this->arrival->expects($this->once())->method('apply')->willReturn(false);
		$this->create("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VTODO\r\nUID:t1\r\nSUMMARY:Pay rent tomorrow\r\nEND:VTODO\r\nEND:VCALENDAR\r\n");
	}

	public function testAnEventIsNotRead(): void {
		$this->arrival->expects($this->never())->method('apply');
		$body = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:e1\r\nSUMMARY:Pay rent tomorrow\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
		$this->assertSame($body, $this->create($body));
	}

	public function testABodyWithoutATaskIsNotEvenParsed(): void {
		// Not iCalendar at all: reading it would throw and log a warning
		$this->arrival->expects($this->never())->method('apply');
		$this->logger->expects($this->never())->method('warning');
		$this->create('not a calendar');
	}
}
