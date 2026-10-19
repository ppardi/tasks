<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Tasks\BackgroundJob;

use DateTimeImmutable;
use OCA\Tasks\Rollover\RolloverService;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\BackgroundJob\IJob;
use OCP\BackgroundJob\TimedJob;

/**
 * Hourly, rolls over the tasks of every user whose local midnight has passed
 * since their last run. Declared in appinfo/info.xml, so it is part of the
 * Tasks app: installed, run and removed with it.
 */
class RolloverJob extends TimedJob {
	public function __construct(
		ITimeFactory $time,
		private RolloverService $service,
	) {
		parent::__construct($time);
		$this->setInterval(3600);
		$this->setTimeSensitivity(IJob::TIME_SENSITIVE);
	}

	protected function run($argument): void {
		$this->service->rolloverDue(new DateTimeImmutable('@' . $this->time->getTime()));
	}
}
