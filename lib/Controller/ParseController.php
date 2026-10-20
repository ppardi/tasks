<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Tasks\Controller;

use DateTimeZone;
use OCA\Tasks\NaturalLanguage\Parser;
use OCA\Tasks\NaturalLanguage\UserZone;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\IRequest;

/**
 * Reads a date, a time and a place from the text typed in the New task box
 * (docs/NL-DATES-DESIGN.md). A POST, so task text never lands in access logs.
 */
class ParseController extends Controller {
	public function __construct(
		string $appName,
		IRequest $request,
		private Parser $parser,
		private UserZone $userZone,
		private ITimeFactory $timeFactory,
		private ?string $userId,
	) {
		parent::__construct($appName, $request);
	}

	/**
	 * Parameters are untyped and checked here: a JSON body of the wrong shape
	 * is a 400, not a type error.
	 *
	 * @param mixed $text The text as typed
	 * @param mixed $tz The browser's time zone, so dates match what it shows;
	 *                  else the user's Nextcloud zone
	 * @param mixed $ignore Kinds not to read: 'date', 'place'
	 */
	#[NoAdminRequired]
	public function parse($text = '', $tz = null, $ignore = []): JSONResponse {
		if (!is_string($text) || !is_array($ignore) || ($tz !== null && !is_string($tz)) || $this->userId === null) {
			return new JSONResponse(['message' => 'Expected { text: string, tz?: string, ignore?: string[] }'], Http::STATUS_BAD_REQUEST);
		}
		$zone = is_string($tz) && in_array($tz, DateTimeZone::listIdentifiers(), true)
			? new DateTimeZone($tz)
			: $this->userZone->for($this->userId);
		$kinds = array_values(array_intersect([Parser::IGNORE_DATE, Parser::IGNORE_PLACE], array_filter($ignore, 'is_string')));
		return new JSONResponse($this->parser->parse($text, $this->timeFactory->now(), $zone, $kinds)->toArray());
	}
}
